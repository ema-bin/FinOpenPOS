import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePlayoffs } from "@/lib/tournament-playoffs";
import {
  aggregateGroupStandingsFromMatches,
  computeQualifiedTeamsForGroup,
  type StandingsMatchInput,
} from "@/lib/tournament-group-standings";
import type { TournamentMatch } from "@/models/db/tournament";

type MatchRow = Pick<
  TournamentMatch,
  | "id"
  | "tournament_group_id"
  | "team1_id"
  | "team2_id"
  | "team1_sets"
  | "team2_sets"
  | "team1_games_total"
  | "team2_games_total"
  | "status"
  | "match_order"
>;

export type PlayoffBracketMatch = ReturnType<typeof generatePlayoffs>[number];

function matchNeedsSchedule(match: PlayoffBracketMatch): boolean {
  return Boolean(
    (match.team1_id && match.team2_id) ||
      match.source_team1 ||
      match.source_team2
  );
}

export function countPlayoffMatchesNeedingSchedule(
  matches: PlayoffBracketMatch[]
): number {
  return matches.filter(matchNeedsSchedule).length;
}

/** Calcula el cuadro de playoffs sin persistir (misma lógica que close-groups). */
export async function buildPlayoffMatchesPlan(
  supabase: SupabaseClient,
  tournamentId: number
): Promise<
  | { ok: true; matches: PlayoffBracketMatch[]; needingSchedule: number }
  | { ok: false; error: string }
> {
  const { data: groups, error: gError } = await supabase
    .from("tournament_groups")
    .select("id, name")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (gError || !groups?.length) {
    return { ok: false, error: "No hay zonas en este torneo" };
  }

  const groupIds = groups.map((g) => g.id);

  const { data: groupTeams, error: gtError } = await supabase
    .from("tournament_group_teams")
    .select("tournament_group_id, team_id")
    .in("tournament_group_id", groupIds);

  if (gtError || !groupTeams) {
    return { ok: false, error: "No se pudieron leer los equipos de zona" };
  }

  const { data: matches, error: mError } = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_group_id, team1_id, team2_id, team1_sets, team2_sets, team1_games_total, team2_games_total, status, match_order, court_id"
    )
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (mError || !matches) {
    return { ok: false, error: "No se pudieron leer los partidos de zona" };
  }

  const standingsMap = aggregateGroupStandingsFromMatches(
    matches as StandingsMatchInput[]
  );

  const qualifiedTeams: { team_id: number; from_group_id: number; pos: number }[] =
    [];

  for (const g of groups) {
    const gid = g.id;
    const map = standingsMap.get(gid) ?? new Map();
    const groupTeamIds = groupTeams
      .filter((gt) => gt.tournament_group_id === gid)
      .map((gt) => gt.team_id);
    const groupMatches = (matches as MatchRow[]).filter(
      (m) => m.tournament_group_id === gid
    );

    qualifiedTeams.push(
      ...computeQualifiedTeamsForGroup(
        gid,
        groupTeamIds,
        groupMatches as StandingsMatchInput[],
        map
      )
    );
  }

  if (qualifiedTeams.length < 2) {
    return { ok: false, error: "No hay suficientes equipos clasificados" };
  }

  const { data: groupsOrdered, error: groupsOrderError } = await supabase
    .from("tournament_groups")
    .select("id, group_order")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (groupsOrderError || !groupsOrdered) {
    return { ok: false, error: "No se pudo leer el orden de zonas" };
  }

  const groupOrderMap = new Map<number, number>();
  groupsOrdered.forEach((g) => groupOrderMap.set(g.id, g.group_order));

  const totalPairs = groupTeams.length;
  const allMatches = generatePlayoffs(qualifiedTeams, groupOrderMap, totalPairs);

  return {
    ok: true,
    matches: allMatches,
    needingSchedule: countPlayoffMatchesNeedingSchedule(allMatches),
  };
}
