"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CopyIcon } from "lucide-react";
import { formatDate, formatTime } from "@/lib/date-utils";
import type { TournamentDTO, GroupsApiResponse, MatchDTO } from "@/models/dto/tournament";
import { tournamentsService, advertisementsService } from "@/services";
import type { AdvertisementDTO } from "@/models/dto/advertisement";
import { splitGroupFlyerAds } from "@/lib/share-group-flyer-ads";
import { ShareGroupFlyerAdsBlock } from "@/components/share-group-flyer-ads";
import { ShareStoryPreviewFrame } from "@/components/share-story-preview-frame";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { ShareTournamentTitle } from "@/components/share-tournament-title";
import {
  buildGroupColorIndexMap,
  getShareZoneBadgeClassName,
  resolveZoneColorIndex,
} from "@/lib/group-zone-colors";
import {
  SHARE_EXPORT_BG,
  SHARE_PORTRAIT_CAPTURE_WIDTH,
  captureShareElementToPng,
  scaleCanvasToInstagramStory,
} from "@/lib/share-image-export";
import "@/components/group-schedule-share.css";
import "@/components/share-portrait-capture.css";

async function fetchTournamentGroups(tournamentId: number): Promise<GroupsApiResponse> {
  return tournamentsService.getGroups(tournamentId);
}

function teamLabel(team: MatchDTO["team1"], matchOrder?: number | null, isTeam1?: boolean): string {
  if (!team) {
    // Para grupos de 4, mostrar labels descriptivos según el match_order
    // Verificar que matchOrder sea exactamente 3 o 4 (no undefined ni null)
    if (matchOrder === 3) {
      // Partido 3: GANADOR partido 1 vs GANADOR partido 2
      return isTeam1 ? "GANADOR 1" : "GANADOR 2";
    } else if (matchOrder === 4) {
      // Partido 4: PERDEDOR partido 1 vs PERDEDOR partido 2
      return isTeam1 ? "PERDEDOR 1" : "PERDEDOR 2";
    }
    return "TBD";
  }
  if (team.display_name) return team.display_name;
  const p1 = team.player1?.last_name || "";
  const p2 = team.player2?.last_name || "";
  return `${p1} / ${p2}`;
}

const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

function getDayShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return DAY_SHORT[date.getDay()] ?? "";
}

interface MatchByDate {
  date: string;
  matches: Array<{
    match: MatchDTO;
    groupName: string;
  }>;
}

export default function ShareGroupScheduleTab({
  tournament,
}: {
  tournament: Pick<
    TournamentDTO,
    "id" | "name" | "category" | "is_puntuable" | "is_category_specific"
  >;
}) {
  const scheduleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [copyingDate, setCopyingDate] = useState<string | null>(null);

  const {
    data,
    isLoading: loading,
  } = useQuery({
    queryKey: ["tournament-groups", tournament.id],
    queryFn: () => fetchTournamentGroups(tournament.id),
    staleTime: 1000 * 30,
  });

  const { data: advertisements = [] } = useQuery<AdvertisementDTO[]>({
    queryKey: ["advertisements"],
    queryFn: () => advertisementsService.getAll(),
    staleTime: 1000 * 60 * 5,
  });
  const { top: adsTop, bottom: adsBottom } = splitGroupFlyerAds(advertisements);

  const groupColorIndexMap = useMemo(
    () => (data?.groups ? buildGroupColorIndexMap(data.groups) : new Map<number, number>()),
    [data?.groups],
  );

  // Organizar partidos por fecha y hora
  const matchesByDate = (() => {
    if (!data || !data.matches || !data.groups) return [];

    // Crear mapa de grupos
    const groupsMap = new Map(data.groups.map(g => [g.id, g.name]));

    // Filtrar solo partidos de zona con fecha y hora
    const scheduledMatches = data.matches.filter(
      (m) => m.phase === "group" && m.match_date && m.start_time
    );

    // Agrupar por fecha
    const grouped: Map<string, MatchByDate["matches"]> = new Map();

    scheduledMatches.forEach((match) => {
      if (!match.match_date) return;

      const groupName = match.tournament_group_id
        ? groupsMap.get(match.tournament_group_id) || "Sin zona"
        : "Sin zona";

      if (!grouped.has(match.match_date)) {
        grouped.set(match.match_date, []);
      }

      grouped.get(match.match_date)!.push({
        match,
        groupName,
      });
    });

    // Convertir a array y ordenar por fecha
    const result: MatchByDate[] = Array.from(grouped.entries())
      .map(([date, matches]) => ({
        date,
        matches: matches.sort((a, b) => {
          // Ordenar por hora de inicio
          const timeA = a.match.start_time || "";
          const timeB = b.match.start_time || "";
          return timeA.localeCompare(timeB);
        }),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return result;
  })();

  const handleCopyImageToClipboard = async (date: string) => {
    const dayRef = scheduleRefs.current.get(date);
    if (!dayRef) {
      toast.error("Error al copiar la imagen");
      return;
    }

    setCopyingDate(date);
    try {
      dayRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 400));

      dayRef.classList.add("share-group-schedule-exporting");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const images = dayRef.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) resolve();
              else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 5000);
              }
            }),
        ),
      );

      const dataUrl = await captureShareElementToPng(dayRef, {
        backgroundColor: SHARE_EXPORT_BG,
        excludeAttribute: "data-share-schedule-exclude",
        captureWidth: SHARE_PORTRAIT_CAPTURE_WIDTH,
      });

      dayRef.classList.remove("share-group-schedule-exporting");

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
      });

      const raw = document.createElement("canvas");
      raw.width = img.width;
      raw.height = img.height;
      raw.getContext("2d")!.drawImage(img, 0, 0);

      const canvas = scaleCanvasToInstagramStory(raw, SHARE_EXPORT_BG);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 1),
      );
      if (!blob) throw new Error("Error al generar imagen");

      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (error) {
      console.error("Error copying image to clipboard:", error);
      toast.error("Error al copiar la imagen al portapapeles");
    } finally {
      setCopyingDate(null);
    }
  };


  if (loading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (matchesByDate.length === 0) {
    return (
      <Card className="border-none shadow-none p-0">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Compartir horarios de zona</CardTitle>
          <CardDescription>
            No hay partidos de zona programados todavía.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      className="border-none shadow-none p-0 bg-gradient-to-b from-slate-50/80 to-slate-100/80 dark:from-slate-900/70 dark:to-slate-900/95"
      style={{ overflow: "visible" }}
    >
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Compartir horarios de zona</CardTitle>
            <CardDescription>
              Formato story (9:16) para Instagram. Copiá la imagen y pegala en tu story.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent
        className="px-0 pt-4"
        style={{ overflow: "visible", maxHeight: "none" }}
      >
        <div className="share-flyer-preview-grid-scroll">
        <div className="share-flyer-preview-grid share-flyer-preview-grid--schedule">
          {matchesByDate.map(({ date, matches }) => (
            <div key={date} className="share-flyer-preview-cell">
              <div className="flex justify-end" data-share-schedule-exclude>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyImageToClipboard(date)}
                  className="h-8"
                  disabled={copyingDate === date}
                >
                  {copyingDate === date ? (
                    <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CopyIcon className="mr-1 h-3 w-3" />
                  )}
                  Copiar imagen
                </Button>
              </div>

              <ShareStoryPreviewFrame>
                <div
                  data-date={date}
                  ref={(el) => {
                    if (el) scheduleRefs.current.set(date, el);
                    else scheduleRefs.current.delete(date);
                  }}
                  className="share-group-schedule-root share-portrait-capture"
                >
                  <div className="share-group-schedule-inner">
                  <div className="share-group-schedule-header">
                    <div className="share-group-schedule-header-text">
                      <ShareTournamentTitle
                        tournamentName={tournament.name}
                        tournamentCategory={tournament.category}
                        isCategorySpecific={tournament.is_category_specific}
                        isPuntuable={tournament.is_puntuable}
                      />
                      <p className="share-group-schedule-date">
                        {getDayShort(date)} — {formatDate(date)}
                      </p>
                    </div>
                    <Logo className="share-group-schedule-logo" />
                  </div>

                  <ShareGroupFlyerAdsBlock
                    rows={adsTop}
                    placement="top"
                    variant="schedule"
                  />

                  <div className="share-group-schedule-matches">
                    {matches.map(({ match, groupName }) => {
                      const time = match.start_time ? formatTime(match.start_time) : "";
                      const team1 = teamLabel(match.team1, match.match_order, true);
                      const team2 = teamLabel(match.team2, match.match_order, false);
                      const zoneColorIndex = resolveZoneColorIndex(
                        match.tournament_group_id,
                        groupName,
                        groupColorIndexMap,
                      );

                      return (
                        <div key={match.id} className="share-group-schedule-row">
                          <span className="share-group-schedule-time">{time}</span>
                          <span
                            className={`share-group-schedule-zone ${getShareZoneBadgeClassName(zoneColorIndex)}`}
                          >
                            {groupName}
                          </span>
                          <span className="share-group-schedule-teams">
                            {team1}
                            <span className="share-group-schedule-vs"> vs </span>
                            {team2}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <ShareGroupFlyerAdsBlock
                    rows={adsBottom}
                    placement="bottom"
                    variant="schedule"
                  />
                </div>
              </div>
              </ShareStoryPreviewFrame>
            </div>
          ))}
        </div>
        </div>
      </CardContent>
    </Card>
  );
}

