/**
 * Cálculo de puntos de ranking al finalizar un torneo puntuable.
 * Reglas: 100 campeón, 80 final, 60 semi, 40 4tos, 20 8vos/16avos, 10 grupos (no clasificó a playoffs).
 * Puntos son por jugador (cada uno de la pareja); suplentes no suman.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatePlayerTournamentPointInput } from "@/models/db/player-tournament-points";
import type { RoundReached } from "@/models/db/player-tournament-points";

const ROUND_POINTS: Record<string, number> = {
  "16avos": 20,
  octavos: 20,
  cuartos: 40,
  semifinal: 60,
  final: 80,
  champion: 100,
  groups: 10,
};

export async function computeAndSaveTournamentRankingPoints(
  supabase: SupabaseClient,
  tournamentId: number
): Promise<{ saved: number }> {
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, is_puntuable, category_id, start_date, end_date")
    .eq("id", tournamentId)
    .single();
  if (tErr || !tournament) {
    throw new Error("Tournament not found");
  }
  if (!tournament.is_puntuable || tournament.category_id == null) {
    return { saved: 0 };
  }

  const categoryId = tournament.category_id as number;
  const year = getTournamentYear(tournament);

  const { data: teams, error: teamsErr } = await supabase
    .from("tournament_teams")
    .select("id, player1_id, player2_id")
    .eq("tournament_id", tournamentId)
    .eq("is_substitute", false);
  if (teamsErr) throw new Error(`Failed to fetch teams: ${teamsErr.message}`);
  const teamList = teams ?? [];

  const teamIds = new Set(teamList.map((t: { id: number }) => t.id));
  const teamToPoints = new Map<
    number,
    { points: number; round_reached: RoundReached }
  >();

  // Initialize all teams as "groups" (10 pts). Playoff losers will overwrite.
  for (const t of teamList) {
    teamToPoints.set(t.id, { points: 10, round_reached: "groups" });
  }

  const { data: playoffs, error: pErr } = await supabase
    .from("tournament_playoffs")
    .select("round, match_id")
    .eq("tournament_id", tournamentId);
  if (pErr) throw new Error(`Failed to fetch playoffs: ${pErr.message}`);
  const playoffRows = playoffs ?? [];

  if (playoffRows.length > 0) {
    const matchIds = playoffRows.map((r: { match_id: number }) => r.match_id);
    const { data: matches, error: mErr } = await supabase
      .from("tournament_matches")
      .select("id, team1_id, team2_id, team1_sets, team2_sets, status")
      .in("id", matchIds)
      .eq("status", "finished");
    if (mErr) throw new Error(`Failed to fetch playoff matches: ${mErr.message}`);
    const matchList = matches ?? [];
    const matchById = new Map(
      matchList.map((m: { id: number }) => [m.id, m])
    );

    for (const row of playoffRows) {
      const match = matchById.get(row.match_id);
      if (!match || match.team1_id == null || match.team2_id == null) continue;
      const round = row.round as string;
      const pts = ROUND_POINTS[round] ?? 20;
      const team1Sets = match.team1_sets ?? 0;
      const team2Sets = match.team2_sets ?? 0;
      const winnerId =
        team1Sets > team2Sets ? match.team1_id : match.team2_id;
      const loserId =
        team1Sets > team2Sets ? match.team2_id : match.team1_id;

      if (round === "final") {
        if (teamIds.has(winnerId)) {
          teamToPoints.set(winnerId, {
            points: 100,
            round_reached: "champion",
          });
        }
        if (teamIds.has(loserId)) {
          teamToPoints.set(loserId, { points: 80, round_reached: "final" });
        }
      } else {
        if (teamIds.has(loserId)) {
          teamToPoints.set(loserId, {
            points: pts,
            round_reached: round as RoundReached,
          });
        }
      }
    }
  }

  const rows: CreatePlayerTournamentPointInput[] = [];
  for (const t of teamList) {
    const entry = teamToPoints.get(t.id);
    if (!entry) continue;
    rows.push({
      tournament_id: tournamentId,
      player_id: t.player1_id,
      category_id: categoryId,
      points: entry.points,
      round_reached: entry.round_reached,
      year,
    });
    rows.push({
      tournament_id: tournamentId,
      player_id: t.player2_id,
      category_id: categoryId,
      points: entry.points,
      round_reached: entry.round_reached,
      year,
    });
  }

  if (rows.length === 0) return { saved: 0 };

  const { error: delErr } = await supabase
    .from("player_tournament_points")
    .delete()
    .eq("tournament_id", tournamentId);
  if (delErr) throw new Error(`Failed to clear points: ${delErr.message}`);

  const { error: insErr } = await supabase
    .from("player_tournament_points")
    .insert(rows);
  if (insErr) throw new Error(`Failed to insert points: ${insErr.message}`);

  return { saved: rows.length };
}

function getTournamentYear(t: {
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
