"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyIcon, Loader2Icon, MedalIcon, Settings2Icon, Share2Icon } from "lucide-react";
import type { Category } from "@/models/db/category";
import type { TournamentRankingPointRule } from "@/models/db/tournament-ranking-point-rule";
import { toast } from "sonner";

const ROUND_LABELS: Record<string, string> = {
  champion: "Campeón",
  final: "Final",
  semifinal: "Semifinal",
  cuartos: "Cuartos",
  octavos: "Octavos",
  "16avos": "16avos",
  groups: "Grupos (no clasifica)",
};

type RankingRow = {
  position: number;
  player_id: number;
  first_name: string;
  last_name: string;
  total_points: number;
  tournaments_played: number;
};

type RankingResponse = {
  category_id: number;
  year: number;
  rows: RankingRow[];
};

export function RankingPuntuableSection() {
  const currentYear = new Date().getFullYear();
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [previewH, setPreviewH] = useState(569);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const { data: categories = [], isLoading: loadingCategories } = useQuery<
    Category[]
  >({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (categories.length > 0 && selectedCategoryId == null) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    // Resetear preview cuando cambie la categoría
    setCanvasReady(false);
    setPreviewH(569);
    setPreviewDataUrl(null);
    setShareMessage(null);
    setGeneratedBlob(null);
    if (previewImgUrl) URL.revokeObjectURL(previewImgUrl);
    setPreviewImgUrl(null);
    setShareDialogOpen(false);
    setCopying(false);
  }, [selectedCategoryId]);

  const { data: ranking, isLoading: loadingRanking } = useQuery<RankingResponse>(
    {
      queryKey: ["ranking", selectedCategoryId, currentYear],
      queryFn: async () => {
        if (selectedCategoryId == null) {
          return { category_id: 0, year: currentYear, rows: [] };
        }
        const res = await fetch(
          `/api/ranking?category_id=${selectedCategoryId}&year=${currentYear}`
        );
        if (!res.ok) throw new Error("Failed to fetch ranking");
        return res.json();
      },
      enabled: selectedCategoryId != null,
      staleTime: 1000 * 60,
    }
  );

  const effectiveCategoryId = selectedCategoryId ?? categories[0]?.id ?? null;
  const categoryName =
    categories.find((c) => c.id === effectiveCategoryId)?.name ?? "Categoría";

  const { data: pointRules = [], isLoading: loadingRules } = useQuery<
    TournamentRankingPointRule[]
  >({
    queryKey: ["ranking-point-rules"],
    queryFn: async () => {
      const res = await fetch("/api/ranking-point-rules");
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
    staleTime: 1000 * 60,
  });

  // Nota: el preview del popup se dibuja directamente en el canvas del DOM
  // (ver handleShareRanking). Este state se mantiene solo por compatibilidad.
  useEffect(() => {
    if (!previewDataUrl) setCanvasReady(false);
  }, [previewDataUrl]);

  const handleShareRanking = async () => {
    if (!ranking?.rows?.length) return;
    try {
      setSharing(true);
      setShareMessage(null);
      setShareDialogOpen(true);
      setPreviewDataUrl(null);
      setCanvasReady(false);
      setGeneratedBlob(null);
      setCopying(false);
      if (previewImgUrl) URL.revokeObjectURL(previewImgUrl);
      setPreviewImgUrl(null);

      // Importante: dejar que el Dialog pinte el canvas antes de dibujar.
      await new Promise<void>((resolve) => setTimeout(resolve, 60));

      const rows = ranking.rows;

      const outW = 1080;
      // Altura dinámica para mostrar todas las posiciones sin recortar
      // (aprox: 54px por fila + cabecera + footer).
      const perRowH = 54;
      const headerH = 360; // incluye franja superior + título/categoria
      const footerH = 140;
      const outH = Math.max(1920, headerH + perRowH * Math.max(rows.length, 1) + footerH);
      const previewCssH = Math.round((outH / outW) * 320);
      setPreviewH(previewCssH);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible");

      // Fondo
      const grad = ctx.createLinearGradient(0, 0, outW, outH);
      grad.addColorStop(0, "#0b3a57");
      grad.addColorStop(1, "#1a5f2e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);

      // Franja superior
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      const padX = 72;
      const headerBandH = 220;
      ctx.fillRect(padX, 90, outW - padX * 2, headerBandH);

      ctx.fillStyle = "#0d3d1f";
      ctx.textAlign = "center";

      // Tipografía (pedida): Anton para títulos, Montserrat para el resto
      const anton = "Anton, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const montserrat = "Montserrat, system-ui, -apple-system, Segoe UI, Roboto, Arial";

      // Títulos
      ctx.font = `bold 54px ${anton}`;
      ctx.fillText(`Ranking puntuable`, outW / 2, 165);

      ctx.font = `bold 40px ${anton}`;
      ctx.fillStyle = "#1b4d2a";
      ctx.fillText(`${categoryName} - ${currentYear}`, outW / 2, 235);

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";

      // Lista
      const startY = 380;
      const rowGap = perRowH;
      const maxTextW = outW - padX * 2;

      const truncate = (text: string, maxW: number, font: string) => {
        ctx.font = font;
        if (ctx.measureText(text).width <= maxW) return text;
        let s = text;
        while (s.length > 0 && ctx.measureText(s + "…").width > maxW) {
          s = s.slice(0, -1);
        }
        return s.length ? s + "…" : "";
      };

      ctx.font = `bold 34px ${montserrat}`;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const lineY = startY + i * rowGap;

        // Card por fila
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        const cardH = 46;
        ctx.fillRect(padX, lineY - 36, outW - padX * 2, cardH);
        ctx.fillStyle = "#ffffff";

        const name = `${r.first_name} ${r.last_name}`.trim();
        const nameFont = `bold 32px ${montserrat}`;
        const nameMaxW = Math.floor(maxTextW * 0.58);
        const safeName = truncate(name, nameMaxW, nameFont);

        ctx.font = `bold 32px ${montserrat}`;
        ctx.fillText(`#${r.position}`, padX + 20, lineY + 6);

        ctx.font = nameFont;
        ctx.fillText(safeName, padX + 160, lineY + 6);

        ctx.font = `bold 28px ${montserrat}`;
        ctx.fillText(`${r.total_points} pts`, outW - padX - 210, lineY + 6);

        ctx.font = `bold 24px ${montserrat}`;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(`${r.tournaments_played} torneos`, outW - padX - 420, lineY + 6);
      }

      // Foot
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `bold 26px ${montserrat}`;
      ctx.textAlign = "center";
      
      // Preview: dibujar en un canvas DOM con resolución chica (evita limites/memoria)
      const domCanvas = canvasRef.current;
      if (domCanvas) {
        const domCtx = domCanvas.getContext("2d");
        if (domCtx) {
          domCanvas.width = 320;
          domCanvas.height = previewCssH;
          domCtx.clearRect(0, 0, domCanvas.width, domCanvas.height);
          domCtx.drawImage(
            canvas,
            0,
            0,
            outW,
            outH,
            0,
            0,
            domCanvas.width,
            domCanvas.height
          );
          setCanvasReady(true);
        } else {
          setCanvasReady(false);
        }
      } else {
        setCanvasReady(false);
      }

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1.0)
      );
      if (!blob) throw new Error("Error generando la imagen");

      setGeneratedBlob(blob);
      // Preview robusto: renderizamos el PNG generado usando el blob.
      // Evita problemas de dibujar un canvas enorme dentro del popup.
      const url = URL.createObjectURL(blob);
      setPreviewImgUrl(url);
      setShareMessage(null);
    } catch (error) {
      console.error("Error sharing ranking PNG:", error);
      setShareMessage("Error al generar/compartir la imagen del ranking.");
      toast.error("No se pudo generar la imagen del ranking.");
    } finally {
      setSharing(false);
    }
  };

  const handleCopyGeneratedImage = async () => {
    if (!generatedBlob) return;
    try {
      setCopying(true);
      setShareMessage(null);
      if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
        setShareMessage("Este navegador no permite copiar imágenes.");
        toast.error("No se pudo copiar: el navegador no permite imágenes al portapapeles.");
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": generatedBlob }),
      ]);
      setShareMessage("Imagen copiada al portapapeles.");
      toast.success("Imagen copiada al portapapeles.");
    } catch (err) {
      console.error("Error copying ranking PNG:", err);
      setShareMessage("No se pudo copiar la imagen.");
      toast.error("No se pudo copiar la imagen del ranking.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MedalIcon className="h-5 w-5" />
            Ranking anual puntuable
          </CardTitle>
          <CardDescription>
            Puntos por torneos puntuables finalizados en el año en curso. La
            categoría es la del torneo; los puntos son individuales por jugador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={effectiveCategoryId != null ? String(effectiveCategoryId) : ""}
                onValueChange={(v) => setSelectedCategoryId(Number(v))}
                disabled={loadingCategories}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Elegir categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">Año {currentYear}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleShareRanking}
              disabled={loadingRanking || sharing || !ranking?.rows?.length}
            >
              {sharing ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Share2Icon className="h-4 w-4 mr-2" />
              )}
              Compartir ranking
            </Button>
          </div>
          <Dialog
            open={shareDialogOpen}
            onOpenChange={(open) => {
              setShareDialogOpen(open);
              if (!open) {
                setCanvasReady(false);
                setPreviewDataUrl(null);
                setGeneratedBlob(null);
                if (previewImgUrl) URL.revokeObjectURL(previewImgUrl);
                setPreviewImgUrl(null);
                setShareMessage(null);
                setCopying(false);
              }
            }}
          >
            <DialogContent className="max-w-lg p-0 overflow-visible">
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>Compartir ranking puntuable</DialogTitle>
                <DialogDescription>
                  Copiá la imagen para compartir en redes con el ranking de tu categoría.
                </DialogDescription>
              </DialogHeader>

              <div className="px-4 pb-4 space-y-3">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleCopyGeneratedImage}
                    disabled={copying || sharing || !generatedBlob}
                  >
                    {copying ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                        Copiando...
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-4 w-4 mr-2" />
                        Copiar imagen
                      </>
                    )}
                  </Button>
                </div>

                <div className="bg-white rounded-lg border-2 border-gray-200 shadow-lg overflow-hidden">
                  <div className="relative">
                    {previewImgUrl && (
                      <img
                        src={previewImgUrl}
                        alt="Preview ranking puntuable"
                        style={{
                          width: 320,
                          height: previewH,
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    )}
                    <canvas
                      ref={canvasRef}
                      className="block"
                      style={{
                        display: previewImgUrl ? "none" : canvasReady ? "block" : "none",
                        width: 320,
                        height: previewH,
                      }}
                    />
                    {!canvasReady && (
                      <div className="h-96 w-full flex items-center justify-center absolute inset-0">
                        <div className="text-center">
                          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Generando imagen...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {shareMessage && (
                  <p className="text-xs text-muted-foreground">{shareMessage}</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {loadingRanking ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ranking && ranking.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead className="text-right">Puntos</TableHead>
                  <TableHead className="text-right">Torneos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.rows.map((row) => (
                  <TableRow key={row.player_id}>
                    <TableCell className="font-medium">{row.position}</TableCell>
                    <TableCell>
                      {row.first_name} {row.last_name}
                    </TableCell>
                    <TableCell className="text-right">{row.total_points}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.tournaments_played}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No hay puntos registrados para {categoryName} en {currentYear}.
              Finalizá torneos puntuables para que se carguen aquí.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit w-full xl:max-w-[320px] xl:justify-self-end">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2Icon className="h-4 w-4" />
            Puntos por ronda
          </CardTitle>
          <CardDescription className="text-xs">
            Puntos que se asignan por ronda al finalizar un torneo puntuable.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingRules ? (
            <div className="flex justify-center py-6">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Ronda</TableHead>
                  <TableHead className="h-8 w-24 text-right text-xs">Puntos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pointRules as TournamentRankingPointRule[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-1.5 text-sm">
                      {ROUND_LABELS[r.round_reached] ?? r.round_reached}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-sm font-medium">
                      {r.points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
