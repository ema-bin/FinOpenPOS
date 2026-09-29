import type { CreatePlayerTournamentPointInput } from "@/models/db/player-tournament-points";
import type { RoundReached } from "@/models/db/player-tournament-points";

export const DEFAULT_RANKING_POINTS: Record<string, number> = {
  champion: 100,
  final: 80,
  semifinal: 60,
  cuartos: 40,
  octavos: 20,
  "16avos": 20,
  groups: 10,
};

export function mergeRoundPointsFromDb(
  rows: Array<{ round_reached: string; points: number }> | null | undefined
): Record<string, number> {
  const map: Record<string, number> = { ...DEFAULT_RANKING_POINTS };
  for (const row of rows ?? []) {
    map[row.round_reached] = row.points;
  }
  return map;
}

export type TeamPointsEntry = {
  points: number;
  round_reached: RoundReached;
};

export type PlayoffMatchResult = {
  team1_id: number;
  team2_id: number;
  team1_sets: number;
  team2_sets: number;
};

export type PlayoffRoundRow = {
  round: string;
  match_id: number;
};

export function getTournamentYear(t: {
  start_date: string | null;
  end_date: string | null;
}): number {
  const dateStr = t.end_date ?? t.start_date ?? null;
  if (dateStr) {
    const y = new Date(dateStr).getFullYear();
    if (!Number.isNaN(y)) return y;
  }
  return new Date().getFullYear();
}

/** Puntos base por equipo (fase de grupos) antes de aplicar playoffs. */
export function initialTeamRankingPoints(
  teamIds: number[],
  roundPoints: Record<string, number>
): Map<number, TeamPointsEntry> {
  const groupsPoints = roundPoints.groups ?? DEFAULT_RANKING_POINTS.groups;
  const map = new Map<number, TeamPointsEntry>();
  for (const id of teamIds) {
    map.set(id, { points: groupsPoints, round_reached: "groups" });
  }
  return map;
}

/** Actualiza el mapa con resultados de partidos de playoff ya finalizados. */
export function applyPlayoffResultsToTeamPoints(
  teamToPoints: Map<number, TeamPointsEntry>,
  teamIds: Set<number>,
  roundPoints: Record<string, number>,
  playoffRows: PlayoffRoundRow[],
  matchById: Map<number, PlayoffMatchResult>
): void {
  for (const row of playoffRows) {
    const match = matchById.get(row.match_id);
    if (!match) continue;

    const round = row.round;
    const pts = roundPoints[round] ?? 20;
    const team1Sets = match.team1_sets ?? 0;
    const team2Sets = match.team2_sets ?? 0;
    const winnerId =
      team1Sets > team2Sets ? match.team1_id : match.team2_id;
    const loserId =
      team1Sets > team2Sets ? match.team2_id : match.team1_id;

    if (round === "final") {
      const championPts = roundPoints.champion ?? DEFAULT_RANKING_POINTS.champion;
      const finalPts = roundPoints.final ?? DEFAULT_RANKING_POINTS.final;
      if (teamIds.has(winnerId)) {
        teamToPoints.set(winnerId, {
          points: championPts,
          round_reached: "champion",
        });
      }
      if (teamIds.has(loserId)) {
        teamToPoints.set(loserId, {
          points: finalPts,
          round_reached: "final",
        });
      }
    } else if (teamIds.has(loserId)) {
      teamToPoints.set(loserId, {
        points: pts,
        round_reached: round as RoundReached,
      });
    }
  }
}

export function buildPlayerTournamentPointRows(input: {
  teamList: Array<{ id: number; player1_id: number; player2_id: number }>;
  teamToPoints: Map<number, TeamPointsEntry>;
  tournamentId: number;
  categoryId: number;
  year: number;
  pointsMultiplier: number;
}): CreatePlayerTournamentPointInput[] {
  const rows: CreatePlayerTournamentPointInput[] = [];
  for (const t of input.teamList) {
    const entry = input.teamToPoints.get(t.id);
    if (!entry) continue;
    const points = entry.points * input.pointsMultiplier;
    rows.push({
      tournament_id: input.tournamentId,
      player_id: t.player1_id,
      category_id: input.categoryId,
      points,
      round_reached: entry.round_reached,
      year: input.year,
    });
    rows.push({
      tournament_id: input.tournamentId,
      player_id: t.player2_id,
      category_id: input.categoryId,
      points,
      round_reached: entry.round_reached,
      year: input.year,
    });
  }
  return rows;
}
