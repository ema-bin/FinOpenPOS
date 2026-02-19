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
import { Logo } from "@/components/Logo";

type ShareMatchResultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentName: string;
  team1Name: string;
  team2Name: string;
  set1: { team1: number; team2: number };
  set2: { team1: number; team2: number };
  set3?: { team1: number; team2: number } | null;
  superTiebreak?: { team1: number; team2: number } | null;
  photoUrl: string | null;
};

export function ShareMatchResultDialog({
  open,
  onOpenChange,
  tournamentName,
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

  const adsTop = advertisements.slice(0, 10);
  const adsBottom = advertisements.slice(10, 20);

  const scoreLine = [
    `${set1.team1}-${set1.team2}`,
    `${set2.team1}-${set2.team2}`,
    set3 != null ? `${set3.team1}-${set3.team2}` : null,
    superTiebreak != null ? `(${superTiebreak.team1}-${superTiebreak.team2})` : null,
  ]
    .filter(Boolean)
    .join(" | ");

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
        width: el.offsetWidth + 20,
        height: el.scrollHeight,
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
      <DialogContent className="max-w-lg p-0 overflow-hidden">
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
            className="relative bg-white rounded-lg border-2 border-gray-200 shadow-lg overflow-hidden"
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              aspectRatio: "4/3",
              minHeight: 320,
              maxWidth: 480,
              margin: "0 auto",
            }}
          >
            {/* Fondo: foto del partido o gradiente */}
            <div
              className="absolute inset-0 bg-cover bg-center rounded-lg"
              style={{
                backgroundImage: photoUrl
                  ? `url(${photoUrl})`
                  : "linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)",
              }}
            />
            <div className="absolute inset-0 bg-black/50" />

            {/* Contenido sobre la imagen */}
            <div className="relative flex flex-col h-full p-4 text-white">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium opacity-90">{tournamentName}</span>
                <div className="h-10 [filter:brightness(0)_invert(1)] opacity-90">
                  <Logo className="h-10" />
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-end">
                {/* Resultado abajo */}
                <div className="bg-black/70 backdrop-blur rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm font-semibold flex-wrap">
                    <span className="truncate max-w-[40%]">{team1Name}</span>
                    <span className="text-white/90">vs</span>
                    <span className="truncate max-w-[40%]">{team2Name}</span>
                  </div>
                  <div className="text-lg font-bold mt-1">{scoreLine}</div>
                </div>

                {/* Logos sponsors - 2 filas de 5 */}
                {(adsTop.length > 0 || adsBottom.length > 0) && (
                  <div className="mt-2 space-y-1">
                    {adsTop.length > 0 && (
                      <div className="grid grid-cols-5 gap-x-1 gap-y-1">
                        {adsTop.map((ad) => (
                          <div
                            key={ad.id}
                            className="aspect-[4/3] max-h-10 border border-white/30 rounded overflow-hidden bg-white/90 flex items-center justify-center p-1"
                          >
                            <img
                              src={ad.image_url}
                              alt={ad.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {adsBottom.length > 0 && (
                      <div className="grid grid-cols-5 gap-x-1 gap-y-1">
                        {adsBottom.map((ad) => (
                          <div
                            key={ad.id}
                            className="aspect-[4/3] max-h-10 border border-white/30 rounded overflow-hidden bg-white/90 flex items-center justify-center p-1"
                          >
                            <img
                              src={ad.image_url}
                              alt={ad.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
