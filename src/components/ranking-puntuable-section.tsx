"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  MASTER_FLYER_SUBSTITUTE_COUNT,
  MASTER_QUALIFIER_COUNT,
  splitMasterRanking,
} from "@/lib/master-ranking-cutoff";
import { toast } from "sonner";

const MASTER_MIN_TOURNAMENTS_KEY = "pcp-ranking-master-min-tournaments";
const MASTER_FLYER_DATE_KEY = "pcp-ranking-master-flyer-date";

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

type PlayerBreakdownEntry = {
  tournament_id: number;
  tournament_name: string;
  round_reached: string;
  points_raw: number;
  points_counted: number;
  from_lower_category: boolean;
  is_grand_prix: boolean;
};

type PlayerBreakdownResponse = {
  player_id: number;
  first_name: string;
  last_name: string;
  total_points: number;
  entries: PlayerBreakdownEntry[];
};

export function RankingPuntuableSection() {
  const currentYear = new Date().getFullYear();
  const [shareKind, setShareKind] = useState<"ranking" | "master">("ranking");
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
  const [breakdownPlayer, setBreakdownPlayer] = useState<RankingRow | null>(null);
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

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [categories]
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [masterCutoffOn, setMasterCutoffOn] = useState(false);
  const [minByCategory, setMinByCategory] = useState<Record<string, string>>({});
  const [minsReady, setMinsReady] = useState(false);
  const [masterFlyerDate, setMasterFlyerDate] = useState("");
  const [flyerDateReady, setFlyerDateReady] = useState(false);

  useEffect(() => {
    if (sortedCategories.length > 0 && selectedCategoryId == null) {
      setSelectedCategoryId(sortedCategories[0].id);
    }
  }, [sortedCategories, selectedCategoryId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MASTER_MIN_TOURNAMENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === "object") setMinByCategory(parsed);
      }
    } catch {
      // Si el valor guardado no se puede leer, el mínimo queda vacío.
    }
    setMinsReady(true);
    try {
      const savedDate = localStorage.getItem(MASTER_FLYER_DATE_KEY);
      if (typeof savedDate === "string") setMasterFlyerDate(savedDate);
    } catch {
      // Si no se puede leer, la fecha del flyer queda vacía.
    }
    setFlyerDateReady(true);
  }, []);

  useEffect(() => {
    if (!minsReady) return;
    localStorage.setItem(MASTER_MIN_TOURNAMENTS_KEY, JSON.stringify(minByCategory));
  }, [minByCategory, minsReady]);

  useEffect(() => {
    if (!flyerDateReady) return;
    localStorage.setItem(MASTER_FLYER_DATE_KEY, masterFlyerDate);
  }, [masterFlyerDate, flyerDateReady]);

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

  const effectiveCategoryId = selectedCategoryId ?? sortedCategories[0]?.id ?? null;
  const categoryName =
    sortedCategories.find((c) => c.id === effectiveCategoryId)?.name ?? "Categoría";
  const minRaw =
    effectiveCategoryId != null ? (minByCategory[String(effectiveCategoryId)] ?? "") : "";
  const minTournaments = minRaw.trim() === "" ? null : Number(minRaw);
  const minIsValid =
    minTournaments != null && Number.isFinite(minTournaments) && minTournaments >= 0;
  const masterSplit = useMemo(() => {
    if (!masterCutoffOn || !minIsValid || !ranking?.rows) return null;
    return splitMasterRanking(ranking.rows, minTournaments);
  }, [masterCutoffOn, minIsValid, minTournaments, ranking?.rows]);

  const { data: breakdown, isLoading: loadingBreakdown } = useQuery<PlayerBreakdownResponse>(
    {
      queryKey: [
        "ranking-player-breakdown",
        breakdownPlayer?.player_id,
        effectiveCategoryId,
        currentYear,
      ],
      queryFn: async () => {
        if (breakdownPlayer == null || effectiveCategoryId == null) {
          throw new Error("Missing params");
        }
        const res = await fetch(
          `/api/ranking/player-breakdown?category_id=${effectiveCategoryId}&player_id=${breakdownPlayer.player_id}&year=${currentYear}`
        );
        if (!res.ok) throw new Error("Failed to fetch breakdown");
        return res.json();
      },
      enabled: breakdownPlayer != null && effectiveCategoryId != null,
      staleTime: 1000 * 60,
    }
  );

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

  const handleShareRanking = async (kind: "ranking" | "master" = "ranking") => {
    const qualifiers = (masterSplit?.qualifiers ?? []).slice(0, MASTER_QUALIFIER_COUNT);
    const flyerSubstitutes = (masterSplit?.substitutes ?? []).slice(0, MASTER_FLYER_SUBSTITUTE_COUNT);
    const sourceRows = kind === "master" ? qualifiers : (ranking?.rows ?? []);
    if (!sourceRows.length) return;
    try {
      setShareKind(kind);
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

      const rows = sourceRows;
      const PAGE_SIZE = 20;
      const pages = kind === "master" ? 1 : Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

      setPageCount(pages);
      setPageIndex(0);

      const outW = 1080;
      const perRowH = 60;
      const headerH = 360;
      const footerH = 140;
      const masterCanvasH = 1920;
      // Fijamos altura por página para que todas las imágenes sean consistentes.
      const outH = kind === "master" ? masterCanvasH : Math.max(2060, headerH + perRowH * PAGE_SIZE + footerH);
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

      const paintBackdrop = (
        ctx: CanvasRenderingContext2D,
        canvasW: number,
        canvasH: number
      ) => {
        if (bgImg) {
          const scale = Math.max(canvasW / bgImg.naturalWidth, canvasH / bgImg.naturalHeight);
          const drawW = bgImg.naturalWidth * scale;
          const drawH = bgImg.naturalHeight * scale;
          const dx = (canvasW - drawW) / 2;
          const dy = (canvasH - drawH) / 2;
          ctx.drawImage(bgImg, dx, dy, drawW, drawH);
        } else {
          const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
          grad.addColorStop(0, "#0b3a57");
          grad.addColorStop(1, "#1a5f2e");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvasW, canvasH);
        }
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, canvasW, canvasH);
      };

      const posterName = (row: RankingRow) => {
        const initial = (row.first_name ?? "").trim().charAt(0).toUpperCase();
        const last = (row.last_name ?? "").trim();
        if (last && initial) return `${last} ${initial}`;
        return (last || row.first_name || "").trim();
      };

      if (kind === "master") {
        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas no disponible");

        paintBackdrop(ctx, outW, outH);
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 4;

        const title = `MASTER ${categoryName}`.toUpperCase();
        let titleSize = 132;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${titleSize}px ${anton}`;
        while (titleSize > 72 && ctx.measureText(title).width > outW - padX * 2) {
          titleSize -= 4;
          ctx.font = `bold ${titleSize}px ${anton}`;
        }
        ctx.fillText(title, outW / 2, 200);

        const dateLabel = masterFlyerDate.trim();
        if (dateLabel) {
          let dateSize = 72;
          ctx.font = `bold ${dateSize}px ${anton}`;
          while (dateSize > 36 && ctx.measureText(dateLabel).width > outW - padX * 2) {
            dateSize -= 2;
            ctx.font = `bold ${dateSize}px ${anton}`;
          }
          ctx.fillText(dateLabel, outW / 2, 310);
        }

        const paintHeading = (label: string, x: number, y: number, size: number) => {
          ctx.font = `bold ${size}px ${anton}`;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.fillText(label, x, y);
          const width = ctx.measureText(label).width;
          ctx.shadowBlur = 0;
          ctx.fillRect(x, y + 10, width, 5);
          ctx.shadowBlur = 18;
        };

        const paintPosterLine = (
          row: RankingRow,
          order: number,
          x: number,
          y: number,
          maxW: number,
          size: number
        ) => {
          const name = posterName(row).toUpperCase();
          const points = String(row.total_points);
          ctx.font = `bold ${size}px ${montserrat}`;
          const prefix = `${order}- `;
          const suffix = ` ${points}`;
          const budget = maxW - ctx.measureText(prefix).width - ctx.measureText(suffix).width;
          const safeName = truncate(ctx, name, Math.max(40, budget), `bold ${size}px ${montserrat}`);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.fillText(`${prefix}${safeName}${suffix}`, x, y);
        };

        const leftRows = qualifiers.slice(0, 8);
        const rightRows = qualifiers.slice(8, 16);
        const colGap = 28;
        const listPadX = 56;
        const colW = (outW - listPadX * 2 - colGap) / 2;
        const leftX = listPadX;
        const rightX = listPadX + colW + colGap;
        const rowH = 52;
        const headingY = dateLabel ? 530 : 410;
        const listTop = headingY + 86;
        const classCount = Math.max(leftRows.length, rightRows.length, 1);
        const classLastLine = listTop + (classCount - 1) * rowH;
        const boxX = listPadX - 16;
        const boxW = outW - boxX * 2;
        const classBoxY = headingY - 72;
        const classBoxH = classLastLine + 30 - classBoxY;

        ctx.save();
        ctx.shadowColor = "rgba(90, 52, 0, 0.55)";
        ctx.shadowBlur = 26;
        ctx.shadowOffsetY = 12;
        ctx.beginPath();
        ctx.roundRect(boxX, classBoxY, boxW, classBoxH, 22);
        const gold = ctx.createLinearGradient(boxX, classBoxY, boxX, classBoxY + classBoxH);
        gold.addColorStop(0, "rgba(255, 214, 120, 0.28)");
        gold.addColorStop(0.55, "rgba(212, 156, 42, 0.22)");
        gold.addColorStop(1, "rgba(140, 88, 12, 0.4)");
        ctx.fillStyle = gold;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255, 236, 186, 0.95)";
        ctx.stroke();
        ctx.restore();
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 4;

        paintHeading("CLASIFICADOS", padX, headingY, 68);
        leftRows.forEach((row, index) => {
          paintPosterLine(row, index + 1, leftX, listTop + index * rowH, colW, 40);
        });
        rightRows.forEach((row, index) => {
          paintPosterLine(row, index + 9, rightX, listTop + index * rowH, colW, 40);
        });

        if (flyerSubstitutes.length > 0) {
          const subLineStep = 68;
          const boxY = classBoxY + classBoxH + 140;
          const substitutesY = boxY + 72;
          const subFirstLine = substitutesY + 78;
          const subLastLine = subFirstLine + (flyerSubstitutes.length - 1) * subLineStep;
          const boxH = subLastLine + 28 - boxY;

          ctx.save();
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 22);
          ctx.fillStyle = "rgba(0,0,0,0.42)";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.stroke();
          ctx.restore();
          ctx.shadowColor = "rgba(0,0,0,0.45)";
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 4;

          paintHeading("SUPLENTES", padX, substitutesY, 58);
          flyerSubstitutes.forEach((row, index) => {
            paintPosterLine(
              row,
              index + 1,
              padX,
              subFirstLine + index * subLineStep,
              outW - listPadX * 2,
              36
            );
          });
        }

        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png", 1.0)
        );
        if (!blob) throw new Error("Error generando la imagen");
        const url = URL.createObjectURL(blob);
        nextBlobs.push(blob);
        nextUrls.push(url);
        setPageBlobs([...nextBlobs]);
        setPageImgUrls([...nextUrls]);
        setCanvasReady(true);
      } else for (let page = 0; page < pages; page++) {
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
        ctx.fillText("RANKING PUNTUABLE", outW / 2, 185);

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

          const firstInitials = (r.first_name ?? "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part.charAt(0))
            .join("");
          const lastName = (r.last_name ?? "").trim();
          const name = lastName
            ? `${lastName}, ${firstInitials}`.trim()
            : `${r.first_name ?? ""}`.trim();
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
                  {sortedCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="master-cutoff"
                checked={masterCutoffOn}
                onCheckedChange={setMasterCutoffOn}
              />
              <Label htmlFor="master-cutoff">Clasificados al Master</Label>
            </div>
            {masterCutoffOn && (
              <div className="space-y-2">
                <Label htmlFor="master-min-tournaments">Más de</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="master-min-tournaments"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className="w-20"
                    value={minRaw}
                    onChange={(event) => {
                      if (effectiveCategoryId == null) return;
                      const value = event.target.value;
                      setMinByCategory((current) => ({
                        ...current,
                        [String(effectiveCategoryId)]: value,
                      }));
                    }}
                  />
                  <span className="text-sm text-muted-foreground">torneos</span>
                </div>
              </div>
            )}
            {masterCutoffOn && (
              <div className="space-y-2">
                <Label htmlFor="master-flyer-date">Fecha en el flyer</Label>
                <Input
                  id="master-flyer-date"
                  type="text"
                  placeholder="4/5/6 Noviembre"
                  className="w-52 max-md:w-full"
                  value={masterFlyerDate}
                  onChange={(event) => setMasterFlyerDate(event.target.value)}
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">Año {currentYear}</p>
            <div className="ml-auto flex flex-wrap gap-2">
              {masterCutoffOn && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleShareRanking("master")}
                  disabled={
                    loadingRanking ||
                    sharing ||
                    !minIsValid ||
                    !masterSplit?.qualifiers.length
                  }
                >
                  {sharing && shareKind === "master" ? (
                    <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Share2Icon className="h-4 w-4 mr-2" />
                  )}
                  Compartir clasificados
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleShareRanking("ranking")}
                disabled={loadingRanking || sharing || !ranking?.rows?.length}
              >
                {sharing && shareKind === "ranking" ? (
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Share2Icon className="h-4 w-4 mr-2" />
                )}
                Compartir ranking
              </Button>
            </div>
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
                <DialogTitle>
                  {shareKind === "master"
                    ? "Compartir clasificados"
                    : "Compartir ranking puntuable"}
                </DialogTitle>
                <DialogDescription>
                  {shareKind === "ranking"
                    ? "Copiá la imagen para compartir en redes con el ranking de tu categoría."
                    : `Historia de Instagram: clasificados en dos columnas y hasta ${MASTER_FLYER_SUBSTITUTE_COUNT} suplentes abajo.`}
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

          <Dialog
            open={breakdownPlayer != null}
            onOpenChange={(open) => {
              if (!open) setBreakdownPlayer(null);
            }}
          >
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0">
              <DialogHeader>
                <DialogTitle>
                  {breakdownPlayer
                    ? `${breakdownPlayer.first_name} ${breakdownPlayer.last_name}`
                    : "Detalle"}
                </DialogTitle>
                <DialogDescription>
                  Torneos y puntos que suman en {categoryName} ({currentYear}
                  ). Los torneos de categoría inferior cuentan al 50% si el
                  jugador ascendió.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto min-h-0 flex-1 py-2">
                {loadingBreakdown ? (
                  <div className="flex justify-center py-10">
                    <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : breakdown && breakdown.entries.length > 0 ? (
                  <>
                  <div className="space-y-2 md:hidden">
                    {breakdown.entries.map((entry) => (
                      <div key={entry.tournament_id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">{entry.tournament_name}</div>
                            {entry.is_grand_prix ? (
                              <div className="text-xs text-muted-foreground">Grand Prix</div>
                            ) : null}
                            {entry.from_lower_category ? (
                              <div className="text-xs text-muted-foreground">50% (cat. inferior)</div>
                            ) : null}
                            <div className="text-xs text-muted-foreground">
                              {ROUND_LABELS[entry.round_reached] ?? entry.round_reached}
                            </div>
                          </div>
                          <div className="shrink-0 text-right font-medium tabular-nums">
                            {entry.points_counted}
                            {entry.from_lower_category && entry.points_raw !== entry.points_counted ? (
                              <span className="block text-xs font-normal text-muted-foreground">de {entry.points_raw}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Torneo</TableHead>
                        <TableHead>Ronda</TableHead>
                        <TableHead className="text-right w-20">Puntos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.entries.map((entry) => (
                        <TableRow key={entry.tournament_id}>
                          <TableCell className="font-medium">
                            <span className="block">{entry.tournament_name}</span>
                            {entry.is_grand_prix && (
                              <span className="text-xs text-muted-foreground">
                                Grand Prix
                              </span>
                            )}
                            {entry.from_lower_category && (
                              <span className="text-xs text-muted-foreground block">
                                50% (cat. inferior)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {ROUND_LABELS[entry.round_reached] ??
                              entry.round_reached}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {entry.points_counted}
                            {entry.from_lower_category &&
                              entry.points_raw !== entry.points_counted && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  de {entry.points_raw}
                                </span>
                              )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sin torneos que sumen en esta categoría.
                  </p>
                )}
              </div>
              {breakdown && breakdown.entries.length > 0 && (
                <div className="flex justify-between border-t pt-3 text-sm font-medium">
                  <span>Total en ranking</span>
                  <span className="tabular-nums">{breakdown.total_points}</span>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {masterCutoffOn && (
            <p className="text-sm text-muted-foreground">
              {minIsValid && masterSplit
                ? `Entran ${masterSplit.qualifiers.length} de ${MASTER_QUALIFIER_COUNT} en ${categoryName}. Suplentes: ${masterSplit.substitutes.length}.`
                : `Entran los primeros ${MASTER_QUALIFIER_COUNT} de ${categoryName} con más torneos que este mínimo. Si no hay ${MASTER_FLYER_SUBSTITUTE_COUNT} suplentes que lleguen, se completan con los siguientes del ranking.`}
            </p>
          )}
          {loadingRanking ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ranking && ranking.rows.length > 0 ? (
            masterSplit &&
            masterSplit.qualifiers.length === 0 &&
            masterSplit.substitutes.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Nadie en {categoryName} supera {minTournaments} torneos en {currentYear}.
              </p>
            ) : (
            <>
            <div className="space-y-2 md:hidden">
              {(masterSplit
                ? [
                    ...masterSplit.qualifiers.map((row) => ({ row, role: "entra" as const })),
                    ...masterSplit.substitutes.map((row) => ({ row, role: "suplente" as const })),
                  ]
                : ranking.rows.map((row) => ({ row, role: null }))
              ).map(({ row, role }, index, list) => (
                <Fragment key={row.player_id}>
                  {role === "suplente" && list[index - 1]?.role !== "suplente" ? (
                    <p className="px-1 text-sm font-medium text-muted-foreground">Suplentes</p>
                  ) : null}
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 rounded-lg border p-3 text-left"
                    onClick={() => setBreakdownPlayer(row)}
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {row.position}. {row.first_name} {row.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.tournaments_played} torneos</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{row.total_points}</div>
                      {masterSplit ? (
                        role === "entra" ? <Badge>Entra</Badge> : <Badge variant="secondary">Suplente</Badge>
                      ) : null}
                    </div>
                  </button>
                </Fragment>
              ))}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-base">#</TableHead>
                  <TableHead className="text-base min-w-[300px]">Jugador</TableHead>
                  <TableHead className="text-right text-base w-24 pr-2">Puntos</TableHead>
                  <TableHead className="text-right text-base w-28 pr-2 pl-0">
                    Torneos
                  </TableHead>
                  {masterSplit && <TableHead className="w-28 text-base">Master</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(masterSplit
                  ? [
                      ...masterSplit.qualifiers.map((row) => ({ row, role: "entra" as const })),
                      ...masterSplit.substitutes.map((row) => ({ row, role: "suplente" as const })),
                    ]
                  : ranking.rows.map((row) => ({ row, role: null }))
                ).map(({ row, role }, index, list) => (
                  <Fragment key={row.player_id}>
                    {role === "suplente" && list[index - 1]?.role !== "suplente" && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="bg-muted/50 py-2 text-sm font-medium text-muted-foreground"
                        >
                          Suplentes
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className="font-medium text-base">
                        {row.position}
                      </TableCell>
                      <TableCell className="text-base min-w-[300px]">
                        <button
                          type="button"
                          className="text-left cursor-pointer hover:underline underline-offset-2 text-foreground"
                          onClick={() => setBreakdownPlayer(row)}
                        >
                          {row.first_name} {row.last_name}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-base w-24 pr-2">
                        {row.total_points}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-base w-28 pr-2 pl-0">
                        {row.tournaments_played}
                      </TableCell>
                      {masterSplit && (
                        <TableCell>
                          {role === "entra" ? (
                            <Badge>Entra</Badge>
                          ) : (
                            <Badge variant="secondary">Suplente</Badge>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
            )
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
            <>
            <div className="space-y-2 md:hidden">
              {(pointRules as TournamentRankingPointRule[]).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{ROUND_LABELS[r.round_reached] ?? r.round_reached}</span>
                  <span className="font-medium">{r.points}</span>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
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
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
