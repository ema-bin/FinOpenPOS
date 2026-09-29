/**
 * Tabla de posiciones de zona y clasificados a playoffs (fuente única para preview, cierre y plan).
 */

export type GroupStandingsStat = {
  team_id: number;
  matches_played: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
};

export type StandingsMatchInput = {
  tournament_group_id: number | null;
  team1_id: number | null;
  team2_id: number | null;
  team1_sets?: number | null;
  team2_sets?: number | null;
  team1_games_total?: number | null;
  team2_games_total?: number | null;
  status: string;
  match_order?: number | null;
};

export type QualifiedFromGroup = {
  team_id: number;
  from_group_id: number;
  pos: number;
};

export function emptyGroupStandingsStat(teamId: number): GroupStandingsStat {
  return {
    team_id: teamId,
    matches_played: 0,
    wins: 0,
    losses: 0,
    sets_won: 0,
    sets_lost: 0,
    games_won: 0,
    games_lost: 0,
  };
}

/** Acumula stats por grupo a partir de partidos finalizados con dos equipos. */
export function aggregateGroupStandingsFromMatches(
  matches: StandingsMatchInput[]
): Map<number, Map<number, GroupStandingsStat>> {
  const standingsMap = new Map<number, Map<number, GroupStandingsStat>>();

  for (const m of matches) {
    if (m.status !== "finished") continue;
    const gid = m.tournament_group_id;
    if (!gid) continue;

    if (!standingsMap.has(gid)) {
      standingsMap.set(gid, new Map());
    }
    const map = standingsMap.get(gid)!;

    if (m.team1_id != null && !map.has(m.team1_id)) {
      map.set(m.team1_id, emptyGroupStandingsStat(m.team1_id));
    }
    if (m.team2_id != null && !map.has(m.team2_id)) {
      map.set(m.team2_id, emptyGroupStandingsStat(m.team2_id));
    }
    if (m.team1_id == null || m.team2_id == null) continue;

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

  return standingsMap;
}

/** Posiciones 1–4 en zona de 4 cuando están definidas las finales (match_order 3 y 4). */
export function groupOfFourForcedPositions(
  groupMatches: StandingsMatchInput[]
): Map<number, number> | null {
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

  if (!canForceOrder) return null;

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

  return new Map<number, number>([
    [winnerOfWinners, 1],
    [loserOfWinners, 2],
    [winnerOfLosers, 3],
    [loserOfLosers, 4],
  ]);
}

export function compareGroupStandingsStats(
  a: GroupStandingsStat,
  b: GroupStandingsStat,
  forcedPositionByTeamId: Map<number, number> | null
): number {
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
}

export function sortGroupTeamStandings(
  stats: GroupStandingsStat[],
  forcedPositionByTeamId: Map<number, number> | null
): GroupStandingsStat[] {
  return [...stats].sort((a, b) =>
    compareGroupStandingsStats(a, b, forcedPositionByTeamId)
  );
}

export function qualifiersCountForGroupSize(size: number): number {
  return size === 4 ? 3 : 2;
}

export function rankedStandingsForGroup(
  groupTeamIds: number[],
  groupMatches: StandingsMatchInput[],
  standingsByTeam: Map<number, GroupStandingsStat>
): GroupStandingsStat[] {
  const stats = groupTeamIds.map(
    (tid) => standingsByTeam.get(tid) ?? emptyGroupStandingsStat(tid)
  );
  const forced =
    groupTeamIds.length === 4
      ? groupOfFourForcedPositions(groupMatches)
      : null;
  return sortGroupTeamStandings(stats, forced);
}

export function computeQualifiedTeamsForGroup(
  groupId: number,
  groupTeamIds: number[],
  groupMatches: StandingsMatchInput[],
  standingsByTeam: Map<number, GroupStandingsStat>
): QualifiedFromGroup[] {
  const stats = groupTeamIds.map(
    (tid) => standingsByTeam.get(tid) ?? emptyGroupStandingsStat(tid)
  );

  const forced =
    groupTeamIds.length === 4
      ? groupOfFourForcedPositions(groupMatches)
      : null;
  const sorted = sortGroupTeamStandings(stats, forced);
  const count = qualifiersCountForGroupSize(groupTeamIds.length);

  return sorted.slice(0, count).map((s, index) => ({
    team_id: s.team_id,
    from_group_id: groupId,
    pos: index + 1,
  }));
}

export function computeQualifiedTeamsFromStandings(input: {
  groups: Array<{ id: number; group_order?: number | null }>;
  groupTeams: Array<{ tournament_group_id: number; team_id: number }>;
  matches: StandingsMatchInput[];
  standingsMap?: Map<number, Map<number, GroupStandingsStat>>;
}): { qualified: QualifiedFromGroup[]; placeholderMap: Map<number, string> } {
  const standingsMap =
    input.standingsMap ?? aggregateGroupStandingsFromMatches(input.matches);

  const letterMap = new Map<number, string>();
  input.groups.forEach((group, index) => {
    const letter = group.group_order
      ? String.fromCharCode(64 + group.group_order)
      : String.fromCharCode(65 + index);
    letterMap.set(group.id, letter);
  });

  const qualified: QualifiedFromGroup[] = [];

  for (const group of input.groups) {
    const groupTeamIds = input.groupTeams
      .filter((gt) => gt.tournament_group_id === group.id)
      .map((gt) => gt.team_id);
    const groupMatches = input.matches.filter(
      (m) => m.tournament_group_id === group.id
    );
    const map = standingsMap.get(group.id) ?? new Map<number, GroupStandingsStat>();

    qualified.push(
      ...computeQualifiedTeamsForGroup(
        group.id,
        groupTeamIds,
        groupMatches,
        map
      )
    );
  }

  const placeholderMap = new Map<number, string>();
  for (const qt of qualified) {
    const letter = letterMap.get(qt.from_group_id) ?? "A";
    placeholderMap.set(qt.team_id, `${qt.pos}${letter}`);
  }

  return { qualified, placeholderMap };
}
