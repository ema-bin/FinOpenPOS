/**
 * Cálculo de puntos de ranking al finalizar un torneo puntuable.
 * Las reglas de puntos por ronda se leen de la tabla tournament_ranking_point_rules.
 * Puntos son por jugador (cada uno de la pareja); suplentes no suman.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPlayoffResultsToTeamPoints,
  buildPlayerTournamentPointRows,
  getTournamentYear,
  initialTeamRankingPoints,
  mergeRoundPointsFromDb,
  type PlayoffMatchResult,
} from "@/lib/tournament-ranking-points-core";

async function getRoundPointsMap(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("tournament_ranking_point_rules")
    .select("round_reached, points");
  if (error) throw new Error(`Failed to fetch ranking point rules: ${error.message}`);
  return mergeRoundPointsFromDb(
    data as Array<{ round_reached: string; points: number }> | null
  );
}

export async function computeAndSaveTournamentRankingPoints(
  supabase: SupabaseClient,
  tournamentId: number
): Promise<{ saved: number }> {
  const roundPoints = await getRoundPointsMap(supabase);

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, is_puntuable, is_grand_prix, category_id, start_date, end_date")
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
  const pointsMultiplier = tournament.is_grand_prix ? 2 : 1;

  const { data: teams, error: teamsErr } = await supabase
    .from("tournament_teams")
    .select("id, player1_id, player2_id")
    .eq("tournament_id", tournamentId)
    .eq("is_substitute", false);
  if (teamsErr) throw new Error(`Failed to fetch teams: ${teamsErr.message}`);
  const teamList = teams ?? [];

  const teamIds = new Set(teamList.map((t: { id: number }) => t.id));
  const teamToPoints = initialTeamRankingPoints(
    teamList.map((t: { id: number }) => t.id),
    roundPoints
  );

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
    const matchList = (matches ?? []) as Array<
      PlayoffMatchResult & { id: number; team1_id: number | null; team2_id: number | null }
    >;
    const matchById = new Map<number, PlayoffMatchResult>();
    for (const m of matchList) {
      if (m.team1_id == null || m.team2_id == null) continue;
      matchById.set(m.id, {
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        team1_sets: m.team1_sets ?? 0,
        team2_sets: m.team2_sets ?? 0,
      });
    }

    applyPlayoffResultsToTeamPoints(
      teamToPoints,
      teamIds,
      roundPoints,
      playoffRows as Array<{ round: string; match_id: number }>,
      matchById
    );
  }

  const rows = buildPlayerTournamentPointRows({
    teamList: teamList as Array<{
      id: number;
      player1_id: number;
      player2_id: number;
    }>,
    teamToPoints,
    tournamentId,
    categoryId,
    year,
    pointsMultiplier,
  });

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
