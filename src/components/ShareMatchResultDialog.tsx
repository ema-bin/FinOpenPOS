"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyIcon, Loader2Icon } from "lucide-react";
import { advertisementsService } from "@/services";
import type { AdvertisementDTO } from "@/models/dto/advertisement";
import { toast } from "sonner";

type ShareMatchResultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceLabel?: string | null;
  team1Name: string;
  team2Name: string;
  set1: { team1: number; team2: number };
  set2: { team1: number; team2: number };
  set3?: { team1: number; team2: number } | null;
  superTiebreak?: { team1: number; team2: number } | null;
  photoUrl: string | null;
};

function onlyLastNames(full: string): string {
  return full
    .split(/\s*\/\s*/)
    .map((part) => part.trim().split(/\s+/).pop() ?? part.trim())
    .join(" / ");
}

export function ShareMatchResultDialog({
  open,
  onOpenChange,
  instanceLabel,
  team1Name,
  team2Name,
  set1,
  set2,
  set3,
  superTiebreak,
  photoUrl,
}: ShareMatchResultDialogProps) {
  const canvaRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);

  const { data: advertisements = [] } = useQuery<AdvertisementDTO[]>({
    queryKey: ["advertisements"],
    queryFn: () => advertisementsService.getAll(),
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  // 3 filas: 2 arriba de 6 cada una, 1 abajo de 7 (justo encima del resultado)
  const n = advertisements.length;
  const adsTopRow1 = advertisements.slice(0, Math.min(6, n));
  const adsTopRow2 = advertisements.slice(6, Math.min(12, n));
  const adsBottom = advertisements.slice(12, Math.min(19, n));

  const scoreLine = [
    `${set1.team1}-${set1.team2}`,
    `${set2.team1}-${set2.team2}`,
    set3 != null ? `${set3.team1}-${set3.team2}` : null,
    superTiebreak != null ? `(${superTiebreak.team1}-${superTiebreak.team2})` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const setScores = [
    { s: set1.team1, t: set1.team2 },
    { s: set2.team1, t: set2.team2 },
    set3 != null ? { s: set3.team1, t: set3.team2 } : null,
  ];

  const team1Apellidos = onlyLastNames(team1Name);
  const team2Apellidos = onlyLastNames(team2Name);

  const handleCopyImage = async () => {
    const el = canvaRef.current;
    const overlayEl = overlayRef.current;
    if (!el) return;
    try {
      setCopying(true);
      const outW = 1280;
      const outH = 1920;

      if (photoUrl) {
        // Solo la foto en alta calidad; overlays dibujados a mano en el canvas (sin captura DOM = sin corrido)
        const photoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Error al cargar la foto"));
          img.src = photoUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas no disponible");

        const scalePhoto = Math.max(outW / photoImg.naturalWidth, outH / photoImg.naturalHeight);
        const w = photoImg.naturalWidth * scalePhoto;
        const h = photoImg.naturalHeight * scalePhoto;
        const x = (outW - w) / 2;
        const y = (outH - h) / 2;
        ctx.drawImage(photoImg, x, y, w, h);

        const S = (n: number) => Math.round(n * 4);
        const drawLogo = async (url: string, lx: number, ly: number, lw: number, lh: number) => {
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((res, rej) => {
              img.onload = () => res();
              img.onerror = () => res();
              img.src = url;
              setTimeout(res, 3000);
            });
            if (img.width) ctx.drawImage(img, lx, ly, lw, lh);
          } catch {
            /* ignorar logo fallido */
          }
        };

        const pad = S(5);
        const logoW1 = S(44);
        const logoH1 = S(34);
        const row1H = S(44);
        const row2H = S(44);
        const instanceY = S(92);
        const resultH = S(80);
        const adsBottomH = S(56);
        const logoW2 = S(40);
        const logoH2 = S(30);

        const centerRow = (count: number, logoW: number) =>
          (outW - count * logoW - (count - 1) * pad) / 2;

        if (adsTopRow1.length > 0) {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(0, 0, outW, row1H);
          let startX = centerRow(adsTopRow1.length, logoW1);
          for (let i = 0; i < adsTopRow1.length; i++) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.roundRect(startX, pad, logoW1, logoH1, S(4));
            ctx.fill();
            await drawLogo(adsTopRow1[i].image_url, startX + S(2), pad + S(2), logoW1 - S(4), logoH1 - S(4));
            startX += logoW1 + pad;
          }
        }
        if (adsTopRow2.length > 0) {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(0, row1H, outW, row2H);
          let startX = centerRow(adsTopRow2.length, logoW1);
          for (let i = 0; i < adsTopRow2.length; i++) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.roundRect(startX, row1H + pad, logoW1, logoH1, S(4));
            ctx.fill();
            await drawLogo(adsTopRow2[i].image_url, startX + S(2), row1H + pad + S(2), logoW1 - S(4), logoH1 - S(4));
            startX += logoW1 + pad;
          }
        }
        if (instanceLabel) {
          ctx.font = `bold ${S(14)}px system-ui,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          const tw = ctx.measureText(instanceLabel).width + S(24);
          ctx.beginPath();
          ctx.roundRect((outW - tw) / 2, instanceY, tw, S(28), S(4));
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(instanceLabel, outW / 2, instanceY + S(20));
        }

        const resultY = outH - resultH;
        if (adsBottom.length > 0) {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(0, resultY - adsBottomH, outW, adsBottomH);
          let startX = centerRow(adsBottom.length, logoW2);
          for (let i = 0; i < adsBottom.length; i++) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.roundRect(startX, resultY - adsBottomH + pad, logoW2, logoH2, S(4));
            ctx.fill();
            await drawLogo(adsBottom[i].image_url, startX + S(2), resultY - adsBottomH + pad + S(2), logoW2 - S(4), logoH2 - S(4));
            startX += logoW2 + pad;
          }
        }

        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, resultY, outW, resultH);
        ctx.font = `bold ${S(12)}px system-ui,sans-serif`;
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        const row1Y = resultY + S(24);
        const row2Y = resultY + S(48);
        ctx.fillText(team1Apellidos, S(12), row1Y);
        ctx.fillText(team2Apellidos, S(12), row2Y);

        const capR = S(7);
        const capGap = S(4);
        const nCaps = setScores.length;
        const capsTotal = nCaps * (capR * 2 + capGap) - capGap;
        const capStartX = outW - S(12) - capsTotal;
        const capCenters = Array.from({ length: nCaps }, (_, i) =>
          capStartX + capR + (capR * 2 + capGap) * i
        );
        [set1.team1, set2.team1, set3?.team1].forEach((v, i) => {
          const cx = capCenters[i];
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.beginPath();
          ctx.arc(cx, row1Y - S(4), capR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${S(10)}px system-ui,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(String(v ?? "–"), cx, row1Y);
        });
        [set1.team2, set2.team2, set3?.team2].forEach((v, i) => {
          const cx = capCenters[i];
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.beginPath();
          ctx.arc(cx, row2Y - S(4), capR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${S(10)}px system-ui,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(String(v ?? "–"), cx, row2Y);
        });

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png", 1.0)
        );
        if (!blob) throw new Error("Error al generar imagen");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } else {
        // Sin foto: captura completa con dom-to-image (gradient)
        const domtoimage = await import("dom-to-image");
        const toPng = domtoimage.default?.toPng || (domtoimage as { toPng?: typeof domtoimage.toPng }).toPng;
        if (!toPng) throw new Error("dom-to-image no disponible");
        const images = el.querySelectorAll("img");
        await Promise.all(
          Array.from(images).map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 5000);
              })
          )
        );
        const dataUrl = await toPng(el, {
          quality: 1.0,
          width: 320,
          height: 480,
          pixelRatio: 2,
          style: { transform: "none", margin: "0" },
        });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }

      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      console.error(err);
      toast.error("Error al copiar la imagen");
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-visible">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Compartir resultado del partido</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Copiá la imagen para compartir en redes con la foto, el resultado y los sponsors.
          </p>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleCopyImage}
              disabled={copying}
            >
              {copying ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CopyIcon className="h-4 w-4 mr-2" />
              )}
              Copiar imagen
            </Button>
          </div>
          <div className="flex justify-center">
            <div
              ref={canvaRef}
              className="relative bg-white rounded-lg border-2 border-gray-200 shadow-lg overflow-hidden flex-shrink-0"
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                width: 320,
                height: 480,
              }}
            >
            {/* Foto a pantalla completa con todos los overlays encima */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: photoUrl
                  ? `url(${photoUrl})`
                  : "linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)",
              }}
            />
            {/* Overlays (publicidades, instancia, resultado) en un solo nodo para captura */}
            <div
              ref={overlayRef}
              className="absolute inset-0 z-10 pointer-events-none"
              style={{ width: 320, height: 480 }}
            >
            {/* Overlay 2 filas arriba: 6 publicidades cada una (tamaño alineado con imagen copiada) */}
            {adsTopRow1.length > 0 && (
              <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-black/30 z-10">
                {adsTopRow1.map((ad) => (
                  <div
                    key={ad.id}
                    className="w-11 h-9 rounded overflow-hidden bg-white/95 flex items-center justify-center p-0.5 flex-shrink-0"
                  >
                    <img src={ad.image_url} alt={ad.name} className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />
                  </div>
                ))}
              </div>
            )}
            {adsTopRow2.length > 0 && (
              <div className="absolute left-0 right-0 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-black/30 z-10" style={{ top: "2.75rem" }}>
                {adsTopRow2.map((ad) => (
                  <div
                    key={ad.id}
                    className="w-11 h-9 rounded overflow-hidden bg-white/95 flex items-center justify-center p-0.5 flex-shrink-0"
                  >
                    <img src={ad.image_url} alt={ad.name} className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />
                  </div>
                ))}
              </div>
            )}

            {/* Instancia del partido: debajo de la segunda fila de publicidades */}
            {instanceLabel && (
              <div className="absolute left-0 right-0 flex justify-center z-10" style={{ top: "5.5rem" }}>
                <span className="text-white font-bold text-sm uppercase tracking-wider bg-black/50 px-3 py-1 rounded">
                  {instanceLabel}
                </span>
              </div>
            )}

            {/* Abajo: fila de 7 publicidades justo encima del resultado + resultado */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col z-10">
              {adsBottom.length > 0 && (
                <div className="flex items-center justify-center gap-1 py-2 px-2 bg-black/30 flex-nowrap min-w-0">
                  {adsBottom.map((ad) => (
                    <div
                      key={ad.id}
                      className="w-10 h-8 rounded overflow-hidden bg-white/95 flex items-center justify-center p-0.5 flex-shrink-0"
                    >
                      <img src={ad.image_url} alt={ad.name} className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />
                    </div>
                  ))}
                </div>
              )}
              {/* Overlay resultado: 2 filas (una por pareja) sobre la foto */}
              <div className="bg-black/75 backdrop-blur-sm px-3 py-2.5 min-w-0">
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-white font-bold text-xs uppercase tracking-wide truncate flex-1 min-w-0">
                  {team1Apellidos}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {setScores.map((set, i) => (
                    <div
                      key={i}
                      className="min-w-[1.75rem] h-7 px-1 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[10px]"
                    >
                      {set ? set.s : "–"}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-white font-bold text-xs uppercase tracking-wide truncate flex-1 min-w-0">
                  {team2Apellidos}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {setScores.map((set, i) => (
                    <div
                      key={i}
                      className="min-w-[1.75rem] h-7 px-1 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-[10px]"
                    >
                      {set ? set.t : "–"}
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>
            </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
