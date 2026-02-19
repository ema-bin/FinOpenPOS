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
  team1Name,
  team2Name,
  set1,
  set2,
  set3,
  superTiebreak,
  photoUrl,
}: ShareMatchResultDialogProps) {
  const canvaRef = useRef<HTMLDivElement>(null);
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
    if (!el) return;
    try {
      setCopying(true);
      const domtoimage = await import("dom-to-image");
      const toPng = domtoimage.default?.toPng || (domtoimage as { toPng?: typeof domtoimage.toPng }).toPng;
      if (!toPng) throw new Error("dom-to-image no disponible");

      const images = el.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve, reject) => {
              if (img.complete) return resolve();
              img.onload = () => resolve();
              img.onerror = reject();
              setTimeout(resolve, 5000);
            })
        )
      );

      const dataUrl = await toPng(el, {
        quality: 1.0,
        width: 320,
        height: 480,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
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
          <div
            ref={canvaRef}
            className="relative bg-white rounded-lg border-2 border-gray-200 shadow-lg box-border overflow-hidden"
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              width: 320,
              height: 480,
              minWidth: 320,
              maxWidth: 320,
              margin: "0 auto",
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
            <div className="absolute inset-0 bg-black/40" />

            {/* Overlay 2 filas arriba: 6 publicidades cada una */}
            {adsTopRow1.length > 0 && (
              <div className="absolute top-0 left-0 right-0 flex items-center justify-center gap-1 py-1 px-2 bg-black/30 z-10">
                {adsTopRow1.map((ad) => (
                  <div
                    key={ad.id}
                    className="w-9 h-7 rounded overflow-hidden bg-white/95 flex items-center justify-center p-0.5 flex-shrink-0"
                  >
                    <img src={ad.image_url} alt={ad.name} className="max-w-full max-h-full object-contain" />
                  </div>
                ))}
              </div>
            )}
            {adsTopRow2.length > 0 && (
              <div className="absolute left-0 right-0 flex items-center justify-center gap-1 py-1 px-2 bg-black/30 z-10" style={{ top: "2.25rem" }}>
                {adsTopRow2.map((ad) => (
                  <div
                    key={ad.id}
                    className="w-9 h-7 rounded overflow-hidden bg-white/95 flex items-center justify-center p-0.5 flex-shrink-0"
                  >
                    <img src={ad.image_url} alt={ad.name} className="max-w-full max-h-full object-contain" />
                  </div>
                ))}
              </div>
            )}

            {/* Abajo: fila de 7 publicidades justo encima del resultado + resultado */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col z-10">
              {adsBottom.length > 0 && (
                <div className="flex items-center justify-center gap-1 py-1.5 px-2 bg-black/30 flex-wrap">
                  {adsBottom.map((ad) => (
                    <div
                      key={ad.id}
                      className="w-8 h-6 rounded overflow-hidden bg-white/95 flex items-center justify-center p-0.5 flex-shrink-0"
                    >
                      <img src={ad.image_url} alt={ad.name} className="max-w-full max-h-full object-contain" />
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
      </DialogContent>
    </Dialog>
  );
}
