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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Loader2Icon,
  MedalIcon,
  Settings2Icon,
  Share2Icon,
} from "lucide-react";
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
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageBlobs, setPageBlobs] = useState<Blob[]>([]);
  const [pageImgUrls, setPageImgUrls] = useState<string[]>([]);
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
    pageImgUrls.forEach((u) => URL.revokeObjectURL(u));
    setPageImgUrls([]);
    setPageBlobs([]);
    setPageIndex(0);
    setPageCount(1);
    setShareDialogOpen(false);
    setCopying(false);
  }, [selectedCategoryId]);

  useEffect(() => {
    const url = pageImgUrls[pageIndex] ?? null;
    const blob = pageBlobs[pageIndex] ?? null;
    setPreviewImgUrl(url);
    setGeneratedBlob(blob);
    setCanvasReady(Boolean(url));
  }, [pageIndex, pageBlobs, pageImgUrls]);

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
      if (pageImgUrls.length) pageImgUrls.forEach((u) => URL.revokeObjectURL(u));
      setPreviewImgUrl(null);
      setPageImgUrls([]);
      setPageBlobs([]);
      setPageIndex(0);
      setPageCount(1);

      // Importante: dejar que el Dialog pinte el popup antes de empezar.
      await new Promise<void>((resolve) => setTimeout(resolve, 60));

      const rows = ranking.rows;
      const PAGE_SIZE = 20;
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

      setPageCount(pages);
      setPageIndex(0);

      const outW = 1080;
      const perRowH = 60;
      const headerH = 360;
      const footerH = 140;
      // Fijamos altura por página para que todas las imágenes sean consistentes.
      const outH = Math.max(2060, headerH + perRowH * PAGE_SIZE + footerH);
      const previewCssH = Math.round((outH / outW) * 320);
      setPreviewH(previewCssH);

      let bgImg: HTMLImageElement | null = null;
      try {
        bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("No se pudo cargar PCP-cartel-frente.jpeg"));
          img.src = "/PCP-cartel-frente.jpeg";
        });
      } catch {
        bgImg = null;
      }

      const anton = "Anton, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const montserrat = "Montserrat, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const padX = 72;
      const headerTableY = 350;
      const startY = 405;
      const rowGap = perRowH;
      // Columna "Jugador" un poco mas ancha para que el nombre tenga mas espacio.
      const nameX = padX + 110;
      // Más separación entre "TORNEOS" y "PUNTOS".
      // tournamentsX marca el borde derecho de la columna "TORNEOS"
      const tournamentsX = outW - padX - 245;
      // pointsX marca el borde izquierdo de la columna "PUNTOS"
      const pointsX = outW - padX - 170;
      const textYOffset = 8;

      const truncate = (
        ctx: CanvasRenderingContext2D,
        text: string,
        maxW: number,
        font: string
      ) => {
        ctx.font = font;
        if (ctx.measureText(text).width <= maxW) return text;
        let s = text;
        while (s.length > 0 && ctx.measureText(s + "…").width > maxW) {
          s = s.slice(0, -1);
        }
        return s.length ? s + "…" : "";
      };

      const nextBlobs: Blob[] = [];
      const nextUrls: string[] = [];

      for (let page = 0; page < pages; page++) {
        const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas no disponible");

        // Fondo: PCP-cartel-frente.jpeg (con fallback al gradiente).
        if (bgImg) {
          const scale = Math.min(outW / bgImg.naturalWidth, outH / bgImg.naturalHeight);
          const drawW = bgImg.naturalWidth * scale;
          const drawH = bgImg.naturalHeight * scale;
          const dx = (outW - drawW) / 2;
          const dy = (outH - drawH) / 2;
          ctx.drawImage(bgImg, dx, dy, drawW, drawH);
        } else {
          const grad = ctx.createLinearGradient(0, 0, outW, outH);
          grad.addColorStop(0, "#0b3a57");
          grad.addColorStop(1, "#1a5f2e");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, outW, outH);
        }

        // Capa de contraste para mejorar legibilidad sobre la imagen de fondo
        const overlay = ctx.createLinearGradient(0, 0, outW, outH);
        overlay.addColorStop(0, "rgba(0,0,0,0.65)");
        overlay.addColorStop(0.45, "rgba(0,0,0,0.65)");
        overlay.addColorStop(1, "rgba(0,0,0,0.65)");
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, outW, outH);

        // Sombra sutil solo para texto (mejor legibilidad)
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 6;

        // Títulos (todo en mayúscula) - más grandes y con sombra
        ctx.font = `bold 78px ${anton}`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(`RANKING PUNTUABLE`, outW / 2, 185);

        ctx.font = `bold 62px ${anton}`;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(72, 185, outW - 144, 120);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          `${String(categoryName).toUpperCase()} - ${String(currentYear).toUpperCase()}`.toUpperCase(),
          outW / 2,
          260
        );

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";

        // Encabezados de tabla
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = `bold 32px ${montserrat}`;
        ctx.textAlign = "left";
        ctx.fillText("JUGADOR", nameX, headerTableY);
        ctx.textAlign = "right";
        ctx.fillText("TORNEOS", tournamentsX, headerTableY);
        ctx.textAlign = "left";
        ctx.fillText("PUNTOS", pointsX, headerTableY);

        for (let i = 0; i < pageRows.length; i++) {
          const r = pageRows[i];
          const lineY = startY + i * rowGap;

          ctx.fillStyle = "#ffffff";

          const name = `${r.first_name} ${r.last_name}`.trim();
          const nameFont = `bold 36px ${montserrat}`;
          const nameMaxW = Math.max(40, tournamentsX - nameX - 24);
          const safeName = truncate(ctx, name, nameMaxW, nameFont).toUpperCase();

          ctx.font = `bold 36px ${montserrat}`;
          ctx.fillText(`#${r.position}`, padX + 20, lineY + textYOffset);

          ctx.font = nameFont;
          ctx.fillText(safeName, nameX, lineY + textYOffset);

          ctx.font = `bold 32px ${montserrat}`;
          ctx.textAlign = "left";
          ctx.fillText(`${r.total_points} PTS`, pointsX, lineY + textYOffset);

          ctx.font = `bold 26px ${montserrat}`;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.textAlign = "right";
          ctx.fillText(`${r.tournaments_played}`, tournamentsX, lineY + textYOffset);
          ctx.textAlign = "left";
        }

        // Foot (se mantiene igual: se preparan estilos, sin texto extra)
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = `bold 26px ${montserrat}`;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 6;
        ctx.shadowOffsetX = 0;

        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png", 1.0)
        );
        if (!blob) throw new Error("Error generando la imagen");

        const url = URL.createObjectURL(blob);
        nextBlobs.push(blob);
        nextUrls.push(url);
        setPageBlobs([...nextBlobs]);
        setPageImgUrls([...nextUrls]);

        // Para que el loader desaparezca rápido con la primera página.
        if (page === 0) setCanvasReady(true);
      }

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
                pageImgUrls.forEach((u) => URL.revokeObjectURL(u));
                setPreviewImgUrl(null);
                setPageImgUrls([]);
                setPageBlobs([]);
                setPageIndex(0);
                setPageCount(1);
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

                {pageCount > 1 && (
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                      disabled={
                        copying ||
                        sharing ||
                        pageIndex <= 0 ||
                        !pageBlobs[pageIndex - 1]
                      }
                    >
                      <ChevronLeftIcon className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>

                    <p className="text-xs text-muted-foreground">
                      Página {pageIndex + 1} / {pageCount}
                    </p>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPageIndex((i) => Math.min(pageCount - 1, i + 1))
                      }
                      disabled={
                        copying ||
                        sharing ||
                        pageIndex >= pageCount - 1 ||
                        !pageBlobs[pageIndex + 1]
                      }
                    >
                      Siguiente
                      <ChevronRightIcon className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}

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
                  <TableHead className="w-16 text-base">#</TableHead>
                  <TableHead className="text-base min-w-[300px]">Jugador</TableHead>
                  <TableHead className="text-right text-base w-24 pr-2">Puntos</TableHead>
                  <TableHead className="text-right text-base w-28 pr-2 pl-0">
                    Torneos
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.rows.map((row) => (
                  <TableRow key={row.player_id}>
                    <TableCell className="font-medium text-base">
                      {row.position}
                    </TableCell>
                    <TableCell className="text-base min-w-[300px]">
                      {row.first_name} {row.last_name}
                    </TableCell>
                    <TableCell className="text-right text-base w-24 pr-2">
                      {row.total_points}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-base w-28 pr-2 pl-0">
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
