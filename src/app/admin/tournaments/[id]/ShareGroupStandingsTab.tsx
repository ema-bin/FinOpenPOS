"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CopyIcon } from "lucide-react";
import { formatTime } from "@/lib/date-utils";
import type { TournamentDTO, ApiResponseStandings, MatchDTO } from "@/models/dto/tournament";
import { tournamentsService, advertisementsService } from "@/services";
import type { AdvertisementDTO } from "@/models/dto/advertisement";
import { pickGroupFlyerAds } from "@/lib/share-group-flyer-ads";
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
import "@/components/group-standings-share.css";
import "@/components/share-portrait-capture.css";

const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

function getDayShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return DAY_SHORT[date.getDay()] ?? "";
}

async function fetchTournamentStandings(tournamentId: number): Promise<ApiResponseStandings> {
  return tournamentsService.getStandings(tournamentId);
}

function teamLabelShort(
  team:
    | {
        display_name?: string | null;
        player1?: { last_name?: string | null } | null;
        player2?: { last_name?: string | null } | null;
      }
    | null
    | undefined,
): string {
  if (!team) return "—";
  if (team.display_name) return team.display_name;
  const lastName1 = team.player1?.last_name ?? "";
  const lastName2 = team.player2?.last_name ?? "";
  if (!lastName1 && !lastName2) return "—";
  return [lastName1, lastName2].filter(Boolean).join(" / ");
}

function teamLabel(
  team: MatchDTO["team1"],
  matchOrder?: number | null,
  isTeam1?: boolean,
): string {
  if (!team) {
    if (matchOrder === 3) return isTeam1 ? "GANADOR 1" : "GANADOR 2";
    if (matchOrder === 4) return isTeam1 ? "PERDEDOR 1" : "PERDEDOR 2";
    return "—";
  }
  return teamLabelShort(team);
}

function formatMatchScore(match: MatchDTO): string | null {
  if (match.set1_team1_games === null || match.set1_team2_games === null) return null;
  const parts = [`${match.set1_team1_games}-${match.set1_team2_games}`];
  if (match.set2_team1_games !== null && match.set2_team2_games !== null) {
    parts.push(`${match.set2_team1_games}-${match.set2_team2_games}`);
  }
  if (match.set3_team1_games !== null && match.set3_team2_games !== null) {
    parts.push(`${match.set3_team1_games}-${match.set3_team2_games}`);
  }
  let score = parts.join(" · ");
  if (
    match.super_tiebreak_team1_points !== null &&
    match.super_tiebreak_team2_points !== null
  ) {
    score += ` (${match.super_tiebreak_team1_points}-${match.super_tiebreak_team2_points})`;
  }
  return score;
}

function formatMatchMeta(match: MatchDTO): string | null {
  if (!match.match_date || !match.start_time) return null;
  const date = new Date(match.match_date + "T00:00:00");
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${getDayShort(match.match_date)} ${dd}/${mm} ${formatTime(match.start_time)}`;
}

export default function ShareGroupStandingsTab({
  tournament,
}: {
  tournament: Pick<
    TournamentDTO,
    "id" | "name" | "category" | "is_puntuable" | "is_category_specific"
  >;
}) {
  const groupRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [copyingGroupId, setCopyingGroupId] = useState<number | null>(null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ["tournament-standings", tournament.id],
    queryFn: () => fetchTournamentStandings(tournament.id),
    staleTime: 1000 * 30,
  });

  const { data: advertisements = [] } = useQuery<AdvertisementDTO[]>({
    queryKey: ["advertisements"],
    queryFn: () => advertisementsService.getAll(),
    staleTime: 1000 * 60 * 5,
  });
  const groupColorIndexMap = useMemo(
    () => (data?.groups ? buildGroupColorIndexMap(data.groups) : new Map<number, number>()),
    [data?.groups],
  );

  const flyerAdsByGroupId = useMemo(() => {
    const map = new Map<number, ReturnType<typeof pickGroupFlyerAds>>();
    for (const group of data?.groups ?? []) {
      map.set(group.id, pickGroupFlyerAds(advertisements));
    }
    return map;
  }, [advertisements, data?.groups]);

  const handleCopyImageToClipboard = async (groupId: number) => {
    const groupRef = groupRefs.current.get(groupId);
    if (!groupRef) {
      toast.error("Error al copiar la imagen");
      return;
    }

    setCopyingGroupId(groupId);
    try {
      groupRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 400));

      groupRef.classList.add("share-group-standings-exporting");
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );

      const images = groupRef.querySelectorAll("img");
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

      const dataUrl = await captureShareElementToPng(groupRef, {
        backgroundColor: SHARE_EXPORT_BG,
        excludeAttribute: "data-share-standings-exclude",
        captureWidth: SHARE_PORTRAIT_CAPTURE_WIDTH,
      });

      groupRef.classList.remove("share-group-standings-exporting");

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
      setCopyingGroupId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <Card className="border-none p-0 shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Compartir posiciones y resultados</CardTitle>
          <CardDescription>No hay zonas generadas todavía.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sortedGroups = [...data.groups].sort((a, b) => {
    if (a.group_order !== undefined && b.group_order !== undefined) {
      return a.group_order - b.group_order;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <Card
      className="border-none bg-gradient-to-b from-slate-50/80 to-slate-100/80 p-0 shadow-none dark:from-slate-900/70 dark:to-slate-900/95"
      style={{ overflow: "visible" }}
    >
      <CardHeader className="px-0 pt-0">
        <CardTitle>Compartir posiciones y resultados</CardTitle>
            <CardDescription>
              Formato story (9:16, 1080×1920) para Instagram. Copiá la imagen y pegala en tu story.
            </CardDescription>
      </CardHeader>

      <CardContent className="px-0 pt-4" style={{ overflow: "visible", maxHeight: "none" }}>
        <div className="share-flyer-preview-grid-scroll">
        <div className="share-flyer-preview-grid share-flyer-preview-grid--standings">
          {sortedGroups.map((group) => {
            const groupStandings = data.standings
              .filter((s) => s.tournament_group_id === group.id)
              .sort((a, b) => {
                if (a.position !== null && b.position !== null) {
                  return a.position - b.position;
                }
                if (b.wins !== a.wins) return b.wins - a.wins;
                const aSetDiff = a.sets_won - a.sets_lost;
                const bSetDiff = b.sets_won - b.sets_lost;
                if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;
                const aGameDiff = a.games_won - a.games_lost;
                const bGameDiff = b.games_won - b.games_lost;
                return bGameDiff - aGameDiff;
              });

            const groupTeams = (data.groupTeams || [])
              .filter((gt) => gt.tournament_group_id === group.id)
              .map((gt) => gt.team)
              .filter((team): team is NonNullable<typeof team> => team !== null);

            const displayStandings =
              groupStandings.length > 0
                ? groupStandings
                : groupTeams.map((team, index) => ({
                    id: team.id,
                    tournament_group_id: group.id,
                    team_id: team.id,
                    position: index + 1,
                    matches_played: 0,
                    wins: 0,
                    losses: 0,
                    sets_won: 0,
                    sets_lost: 0,
                    games_won: 0,
                    games_lost: 0,
                    team,
                  }));

            const groupMatches = data.matches
              .filter((m) => m.tournament_group_id === group.id)
              .sort((a, b) => {
                if (a.match_date && b.match_date) {
                  const dateCompare = a.match_date.localeCompare(b.match_date);
                  if (dateCompare !== 0) return dateCompare;
                }
                if (a.start_time && b.start_time) {
                  return a.start_time.localeCompare(b.start_time);
                }
                return 0;
              });

            const zoneColorIndex = resolveZoneColorIndex(
              group.id,
              group.name,
              groupColorIndexMap,
            );

            const flyerAds = flyerAdsByGroupId.get(group.id) ?? { top: [], bottom: [] };

            return (
              <div key={group.id} className="share-flyer-preview-cell">
                <div className="flex justify-end" data-share-standings-exclude>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyImageToClipboard(group.id)}
                    className="h-8"
                    disabled={copyingGroupId === group.id}
                  >
                    {copyingGroupId === group.id ? (
                      <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <CopyIcon className="mr-1 h-3 w-3" />
                    )}
                    Copiar imagen
                  </Button>
                </div>

                <ShareStoryPreviewFrame>
                  <div
                    ref={(el) => {
                      if (el) groupRefs.current.set(group.id, el);
                      else groupRefs.current.delete(group.id);
                    }}
                    className="share-group-standings-root share-portrait-capture"
                  >
                    <div className="share-group-standings-inner">
                    <div className="share-group-schedule-header share-group-standings-header">
                      <div className="share-group-schedule-header-text">
                        <div className="share-group-standings-title-block">
                          <ShareTournamentTitle
                            tournamentName={tournament.name}
                            tournamentCategory={tournament.category}
                            isCategorySpecific={tournament.is_category_specific}
                            isPuntuable={tournament.is_puntuable}
                          />
                          <span
                            className={`share-group-schedule-zone ${getShareZoneBadgeClassName(zoneColorIndex)}`}
                          >
                            {group.name}
                          </span>
                        </div>
                      </div>
                      <Logo className="share-group-schedule-logo" />
                    </div>

                    <ShareGroupFlyerAdsBlock
                      ads={flyerAds.top}
                      placement="top"
                      variant="standings"
                    />

                    <section className="share-group-standings-section share-group-standings-section--table">
                      <div className="share-group-standings-table-wrap">
                        <table className="share-group-standings-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Equipo</th>
                              <th>PJ</th>
                              <th>G</th>
                              <th>P</th>
                              <th>Sets</th>
                              <th>Games</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayStandings.length > 0 ? (
                              displayStandings.map((standing) => {
                                const setDiff = standing.sets_won - standing.sets_lost;
                                const gameDiff = standing.games_won - standing.games_lost;
                                return (
                                  <tr key={standing.id}>
                                    <td>{standing.position ?? "—"}</td>
                                    <td className="share-group-standings-team">
                                      {teamLabelShort(standing.team)}
                                    </td>
                                    <td>{standing.matches_played}</td>
                                    <td className="share-group-standings-wins">{standing.wins}</td>
                                    <td className="share-group-standings-losses">
                                      {standing.losses}
                                    </td>
                                    <td>{setDiff > 0 ? `+${setDiff}` : setDiff}</td>
                                    <td>{gameDiff > 0 ? `+${gameDiff}` : gameDiff}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={7} style={{ textAlign: "center", padding: "8px" }}>
                                  Sin datos
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {groupMatches.length > 0 && (
                      <section className="share-group-standings-section share-group-standings-section--results">
                        <div className="share-group-standings-results">
                          {groupMatches.map((match) => {
                            const meta = formatMatchMeta(match);
                            const score = formatMatchScore(match);
                            const team1 = teamLabel(match.team1, match.match_order, true);
                            const team2 = teamLabel(match.team2, match.match_order, false);

                            return (
                              <div key={match.id} className="share-group-standings-result-row">
                                <div className="share-group-standings-result-body">
                                  {meta ? (
                                    <span className="share-group-standings-result-meta">{meta}</span>
                                  ) : null}
                                  <span className="share-group-standings-result-teams">
                                    {team1}
                                    <span className="share-group-standings-vs"> vs </span>
                                    {team2}
                                  </span>
                                  {score ? (
                                    <span className="share-group-standings-result-score">
                                      {score}
                                    </span>
                                  ) : (
                                    <span className="share-group-standings-result-pending">
                                      Pendiente
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <ShareGroupFlyerAdsBlock
                      ads={flyerAds.bottom}
                      placement="bottom"
                      variant="standings"
                    />
                    </div>
                  </div>
                </ShareStoryPreviewFrame>
              </div>
            );
          })}
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
