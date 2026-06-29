"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  matchResultAdRowDefs,
  MATCH_RESULT_ADS_TOTAL,
  pickRandomAdvertisements,
  splitMatchResultAds,
} from "@/lib/share-match-result-ads";
import { ShareMatchResultAdsBlock } from "@/components/share-match-result-ads";
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
  const [selectedAds, setSelectedAds] = useState<AdvertisementDTO[]>([]);
  const adsPickedRef = useRef(false);

  const { data: advertisements = [] } = useQuery<AdvertisementDTO[]>({
    queryKey: ["advertisements"],
    queryFn: () => advertisementsService.getAll(),
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      adsPickedRef.current = false;
      setSelectedAds([]);
      return;
    }
    if (advertisements.length === 0 || adsPickedRef.current) return;
    setSelectedAds(pickRandomAdvertisements(advertisements, MATCH_RESULT_ADS_TOTAL));
    adsPickedRef.current = true;
  }, [open, advertisements]);

  const adRows = splitMatchResultAds(selectedAds);
  const topAdRowCount = matchResultAdRowDefs(adRows).filter((r) => r.variant === "top").length;

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
      const outW = 1080;
      const outH = 1920;

      if (photoUrl) {
        // Solo la foto en alta calidad; overlays dibujados a mano en el canvas (sin captura DOM = sin corrido). Formato 16:9 para IG.
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

        const Sw = (n: number) => Math.round(n * (outW / 320));
        const Sh = (n: number) => Math.round(n * (outH / 480));
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
            if (!img.naturalWidth || !img.naturalHeight) return;
            const scale = Math.min(lw / img.naturalWidth, lh / img.naturalHeight);
            const drawW = img.naturalWidth * scale;
            const drawH = img.naturalHeight * scale;
            const drawX = lx + (lw - drawW) / 2;
            const drawY = ly + (lh - drawH) / 2;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
          } catch {
            /* ignorar logo fallido */
          }
        };

        const padW = Sw(5);
        const padH = Sh(5);
        const logoWTop = Sw(64);
        const logoHTop = Sh(48);
        const rowTopH = Sh(58);
        const logoWBottom = Sw(56);
        const logoHBottom = Sh(44);
        const rowBottomH = Sh(58);
        const resultH = Sh(80);

        const centerRow = (count: number, logoW: number) =>
          (outW - count * logoW - (count - 1) * padW) / 2;

        const drawAdRow = async (
          ads: AdvertisementDTO[],
          y: number,
          logoW: number,
          logoH: number,
          rowH: number
        ) => {
          if (ads.length === 0) return;
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(0, y, outW, rowH);
          let startX = centerRow(ads.length, logoW);
          for (const ad of ads) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.beginPath();
            ctx.roundRect(startX, y + padH, logoW, logoH, Sw(4));
            ctx.fill();
            await drawLogo(
              ad.image_url,
              startX + Sw(2),
              y + padH + Sh(2),
              logoW - Sw(4),
              logoH - Sh(4)
            );
            startX += logoW + padW;
          }
        };

        let topY = 0;
        if (adRows.row1.length > 0) {
          await drawAdRow(adRows.row1, topY, logoWTop, logoHTop, rowTopH);
          topY += rowTopH;
        }
        if (adRows.row2.length > 0) {
          await drawAdRow(adRows.row2, topY, logoWTop, logoHTop, rowTopH);
          topY += rowTopH;
        }

        const instanceY = topY > 0 ? topY + Sh(8) : Sh(12);
        if (instanceLabel) {
          const instanceUpper = instanceLabel.toUpperCase();
          ctx.font = `bold ${Sw(14)}px system-ui,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          const tw = ctx.measureText(instanceUpper).width + Sw(24);
          ctx.beginPath();
          ctx.roundRect((outW - tw) / 2, instanceY, tw, Sh(28), Sw(4));
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(instanceUpper, outW / 2, instanceY + Sh(20));
        }

        const resultY = outH - resultH;
        if (adRows.row3.length > 0) {
          await drawAdRow(
            adRows.row3,
            resultY - rowBottomH,
            logoWBottom,
            logoHBottom,
            rowBottomH
          );
        }

        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, resultY, outW, resultH);
        ctx.font = `bold ${Sw(12)}px system-ui,sans-serif`;
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        const row1Y = resultY + Sh(24);
        const row2Y = resultY + Sh(48);
        ctx.fillText(team1Apellidos.toUpperCase(), Sw(12), row1Y);
        ctx.fillText(team2Apellidos.toUpperCase(), Sw(12), row2Y);

        const capR = Sh(7);
        const capGap = Sw(4);
        const nCaps = setScores.length;
        const capsTotal = nCaps * (capR * 2 + capGap) - capGap;
        const capStartX = outW - Sw(12) - capsTotal;
        const capCenters = Array.from({ length: nCaps }, (_, i) =>
          capStartX + capR + (capR * 2 + capGap) * i
        );
        [set1.team1, set2.team1, set3?.team1].forEach((v, i) => {
          const cx = capCenters[i];
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.beginPath();
          ctx.arc(cx, row1Y - Sh(4), capR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Sw(10)}px system-ui,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(String(v ?? "–"), cx, row1Y);
        });
        [set1.team2, set2.team2, set3?.team2].forEach((v, i) => {
          const cx = capCenters[i];
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.beginPath();
          ctx.arc(cx, row2Y - Sh(4), capR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Sw(10)}px system-ui,sans-serif`;
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
          height: 569,
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
                height: 569,
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
              style={{ width: 320, height: 569 }}
            >
            <ShareMatchResultAdsBlock rows={adRows} placement="top" />

            {/* Instancia del partido: debajo de las dos filas superiores de publicidades */}
            {instanceLabel && (
              <div
                className="absolute left-0 right-0 flex justify-center z-10"
                style={{
                  top: topAdRowCount > 0 ? `${topAdRowCount * 3.75}rem` : "0.5rem",
                }}
              >
                <span className="text-white font-bold text-sm uppercase tracking-wider bg-black/50 px-3 py-1 rounded">
                  {instanceLabel.toUpperCase()}
                </span>
              </div>
            )}

            {/* Abajo: 4 publicidades justo encima del resultado + resultado */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col z-10">
              <ShareMatchResultAdsBlock rows={adRows} placement="bottom" />
              {/* Overlay resultado: 2 filas (una por pareja) sobre la foto */}
              <div className="bg-black/75 backdrop-blur-sm px-3 py-2.5 min-w-0">
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-white font-bold text-xs uppercase tracking-wide truncate flex-1 min-w-0">
                  {team1Apellidos.toUpperCase()}
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
                  {team2Apellidos.toUpperCase()}
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
