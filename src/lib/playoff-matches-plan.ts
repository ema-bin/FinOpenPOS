import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePlayoffs } from "@/lib/tournament-playoffs";
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

  type Stand = {
    team_id: number;
    matches_played: number;
    wins: number;
    losses: number;
    sets_won: number;
    sets_lost: number;
    games_won: number;
    games_lost: number;
  };

  const standingsMap = new Map<number, Map<number, Stand>>();
  const initStand = (teamId: number): Stand => ({
    team_id: teamId,
    matches_played: 0,
    wins: 0,
    losses: 0,
    sets_won: 0,
    sets_lost: 0,
    games_won: 0,
    games_lost: 0,
  });

  for (const m of matches as MatchRow[]) {
    if (m.status !== "finished") continue;
    const gid = m.tournament_group_id;
    if (!gid) continue;

    if (!standingsMap.has(gid)) standingsMap.set(gid, new Map());
    const map = standingsMap.get(gid)!;

    if (m.team1_id && !map.has(m.team1_id)) map.set(m.team1_id, initStand(m.team1_id));
    if (m.team2_id && !map.has(m.team2_id)) map.set(m.team2_id, initStand(m.team2_id));
    if (!m.team1_id || !m.team2_id) continue;

    const s1 = map.get(m.team1_id)!;
    const s2 = map.get(m.team2_id)!;
    s1.matches_played += 1;
    s2.matches_played += 1;

    const t1sets = m.team1_sets ?? 0;
    const t2sets = m.team2_sets ?? 0;
    const t1games = m.team1_games_total ?? 0;
    const t2games = m.team2_games_total ?? 0;

    s1.sets_won += t1sets;
    s1.sets_lost += t2sets;
    s2.sets_won += t2sets;
    s2.sets_lost += t1sets;
    s1.games_won += t1games;
    s1.games_lost += t2games;
    s2.games_won += t2games;
    s2.games_lost += t1games;

    if (t1sets > t2sets) {
      s1.wins += 1;
      s2.losses += 1;
    } else if (t2sets > t1sets) {
      s2.wins += 1;
      s1.losses += 1;
    }
  }

  const qualifiedTeams: { team_id: number; from_group_id: number; pos: number }[] =
    [];

  for (const g of groups) {
    const gid = g.id;
    const map = standingsMap.get(gid) ?? new Map<number, Stand>();
    const groupTeamIds = groupTeams
      .filter((gt) => gt.tournament_group_id === gid)
      .map((gt) => gt.team_id);

    const stats: Stand[] = groupTeamIds.map(
      (tid) => map.get(tid) ?? initStand(tid)
    );

    let forcedPositionByTeamId: Map<number, number> | null = null;
    if (groupTeamIds.length === 4) {
      const groupMatches = (matches as MatchRow[]).filter(
        (m) => m.tournament_group_id === gid
      );
      const winnersMatch = groupMatches.find((m) => m.match_order === 3);
      const losersMatch = groupMatches.find((m) => m.match_order === 4);
      const canForceOrder =
        winnersMatch &&
        losersMatch &&
        winnersMatch.status === "finished" &&
        losersMatch.status === "finished" &&
        winnersMatch.team1_id &&
        winnersMatch.team2_id &&
        losersMatch.team1_id &&
        losersMatch.team2_id;

      if (canForceOrder) {
        const winnerOfWinners =
          (winnersMatch!.team1_sets ?? 0) > (winnersMatch!.team2_sets ?? 0)
            ? winnersMatch!.team1_id!
            : winnersMatch!.team2_id!;
        const loserOfWinners =
          (winnersMatch!.team1_sets ?? 0) > (winnersMatch!.team2_sets ?? 0)
            ? winnersMatch!.team2_id!
            : winnersMatch!.team1_id!;
        const winnerOfLosers =
          (losersMatch!.team1_sets ?? 0) > (losersMatch!.team2_sets ?? 0)
            ? losersMatch!.team1_id!
            : losersMatch!.team2_id!;
        const loserOfLosers =
          (losersMatch!.team1_sets ?? 0) > (losersMatch!.team2_sets ?? 0)
            ? losersMatch!.team2_id!
            : losersMatch!.team1_id!;

        forcedPositionByTeamId = new Map<number, number>([
          [winnerOfWinners, 1],
          [loserOfWinners, 2],
          [winnerOfLosers, 3],
          [loserOfLosers, 4],
        ]);
      }
    }

    stats.sort((a, b) => {
      if (forcedPositionByTeamId) {
        const pA = forcedPositionByTeamId.get(a.team_id) ?? 999;
        const pB = forcedPositionByTeamId.get(b.team_id) ?? 999;
        if (pA !== pB) return pA - pB;
      }
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aSetDiff = a.sets_won - a.sets_lost;
      const bSetDiff = b.sets_won - b.sets_lost;
      if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;
      const aGameDiff = a.games_won - a.games_lost;
      const bGameDiff = b.games_won - b.games_lost;
      return bGameDiff - aGameDiff;
    });

    const size = groupTeamIds.length;
    const qualifiersCount = size === 4 ? 3 : 2;
    stats.slice(0, qualifiersCount).forEach((s, index) => {
      qualifiedTeams.push({
        team_id: s.team_id,
        from_group_id: gid,
        pos: index + 1,
      });
    });
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
