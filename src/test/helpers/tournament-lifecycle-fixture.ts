import { pairingFromPreset } from "@/lib/group-of-four-pairings";
import {
  buildProjectedQualifiedTeams,
  computeGroupSizes,
} from "@/lib/tournament-group-sizes";
import {
  computeQualifiedTeamsFromStandings,
  type StandingsMatchInput,
} from "@/lib/tournament-group-standings";
import {
  generatePlayoffs,
  type PlayoffMatch,
} from "@/lib/tournament-playoffs";

export type TournamentFixture = {
  activeTeamCount: number;
  groupSizes: number[];
  groups: Array<{ id: number; group_order: number; name: string }>;
  groupTeams: Array<{ tournament_group_id: number; team_id: number }>;
  matches: StandingsMatchInput[];
};

function finishedMatch(
  groupId: number,
  team1Id: number,
  team2Id: number,
  team1Wins: boolean,
  matchOrder?: number
): StandingsMatchInput {
  return {
    tournament_group_id: groupId,
    team1_id: team1Id,
    team2_id: team2Id,
    team1_sets: team1Wins ? 2 : 0,
    team2_sets: team1Wins ? 0 : 2,
    team1_games_total: 12,
    team2_games_total: 4,
    status: "finished",
    match_order: matchOrder ?? null,
  };
}

/** Simula resultados deterministas: favorito (menor id) domina la zona. */
function simulateGroupOfThree(
  groupId: number,
  teams: [number, number, number]
): StandingsMatchInput[] {
  const [a, b, c] = teams;
  return [
    finishedMatch(groupId, a, b, true),
    finishedMatch(groupId, a, c, true),
    finishedMatch(groupId, b, c, true),
  ];
}

function simulateGroupOfFour(
  groupId: number,
  teams: [number, number, number, number]
): StandingsMatchInput[] {
  const ordered = teams;
  const { match1, match2 } = pairingFromPreset(ordered, "1-4_2-3");
  const [t1, t4] = match1;
  const [t2, t3] = match2;
  return [
    finishedMatch(groupId, t1, t4, true, 1),
    finishedMatch(groupId, t2, t3, true, 2),
    finishedMatch(groupId, t1, t2, true, 3),
    finishedMatch(groupId, t4, t3, true, 4),
  ];
}

/**
 * Torneo sintético post–cierre de inscripción: zonas, equipos y partidos de zona ya jugados.
 */
export function buildSimulatedTournamentFixture(
  activeTeamCount: number
): TournamentFixture {
  const groupSizes = computeGroupSizes(activeTeamCount);
  if (groupSizes.length === 0) {
    throw new Error(`Cantidad de equipos inválida: ${activeTeamCount}`);
  }

  const groups: TournamentFixture["groups"] = [];
  const groupTeams: TournamentFixture["groupTeams"] = [];
  const matches: StandingsMatchInput[] = [];

  let nextTeamId = 1;
  groupSizes.forEach((size, index) => {
    const groupOrder = index + 1;
    const groupId = groupOrder;
    groups.push({
      id: groupId,
      group_order: groupOrder,
      name: `Zona ${String.fromCharCode(64 + groupOrder)}`,
    });

    const teamsInGroup: number[] = [];
    for (let i = 0; i < size; i++) {
      const teamId = nextTeamId++;
      teamsInGroup.push(teamId);
      groupTeams.push({ tournament_group_id: groupId, team_id: teamId });
    }

    if (size === 3) {
      matches.push(
        ...simulateGroupOfThree(groupId, teamsInGroup as [number, number, number])
      );
    } else if (size === 4) {
      matches.push(
        ...simulateGroupOfFour(groupId, teamsInGroup as [number, number, number, number])
      );
    }
  });

  return {
    activeTeamCount,
    groupSizes,
    groups,
    groupTeams,
    matches,
  };
}

export type PlayoffsComputation = {
  qualified: Array<{ team_id: number; from_group_id: number; pos: number }>;
  placeholderMap: Map<number, string>;
  groupOrderMap: Map<number, number>;
  totalPairs: number;
  matches: PlayoffMatch[];
};

/** Misma cadena que playoff-preview (grupos cerrados) y execute-close-groups. */
export function computePlayoffsAfterGroupPhase(
  fixture: TournamentFixture
): PlayoffsComputation {
  const { qualified, placeholderMap } = computeQualifiedTeamsFromStandings({
    groups: fixture.groups,
    groupTeams: fixture.groupTeams,
    matches: fixture.matches,
  });

  const groupOrderMap = new Map<number, number>();
  for (const g of fixture.groups) {
    groupOrderMap.set(g.id, g.group_order);
  }

  const totalPairs = fixture.groupTeams.length;
  const matches = generatePlayoffs(qualified, groupOrderMap, totalPairs);

  return {
    qualified,
    placeholderMap,
    groupOrderMap,
    totalPairs,
    matches,
  };
}

/** Preview desde inscripción (sin resultados reales), como playoff-preview con projectedFromRegistration. */
export function computeRegistrationPlayoffPreview(
  activeTeamCount: number
): PlayoffsComputation {
  const groupSizes = computeGroupSizes(activeTeamCount);
  const projected = buildProjectedQualifiedTeams(groupSizes);
  const matches = generatePlayoffs(
    projected.qualified,
    projected.groupOrderMap,
    projected.totalPairs
  );
  return {
    qualified: projected.qualified,
    placeholderMap: projected.placeholderMap,
    groupOrderMap: projected.groupOrderMap,
    totalPairs: projected.totalPairs,
    matches,
  };
}

export function teamLabelFromQualified(
  qualified: Array<{ team_id: number; from_group_id: number; pos: number }>,
  groupOrderMap: Map<number, number>
): Map<number, string> {
  const map = new Map<number, string>();
  for (const q of qualified) {
    const order = groupOrderMap.get(q.from_group_id) ?? 0;
    const letter =
      order >= 1 && order <= 26 ? String.fromCharCode(64 + order) : "?";
    map.set(q.team_id, `${q.pos}${letter}`);
  }
  return map;
}

export type NormalizedPlayoffSlot = {
  round: string;
  bracket_pos: number;
  team1: string | null;
  team2: string | null;
};

export function normalizePlayoffBracket(
  matches: PlayoffMatch[],
  labelByTeamId: Map<number, string>
): NormalizedPlayoffSlot[] {
  return matches
    .map((m) => ({
      round: m.round,
      bracket_pos: m.bracket_pos,
      team1: m.team1_id
        ? (labelByTeamId.get(m.team1_id) ?? String(m.team1_id))
        : m.source_team1,
      team2: m.team2_id
        ? (labelByTeamId.get(m.team2_id) ?? String(m.team2_id))
        : m.source_team2,
    }))
    .sort((a, b) => {
      const roundOrder: Record<string, number> = {
        "16avos": 1,
        octavos: 2,
        cuartos: 3,
        semifinal: 4,
        final: 5,
      };
      const ra = roundOrder[a.round] ?? 99;
      const rb = roundOrder[b.round] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.bracket_pos - b.bracket_pos;
    });
}

/** 1ª ronda del preview con placeholders (equivalente a applyPlaceholders del API). */
export function normalizePlayoffPreviewFirstRound(
  matches: PlayoffMatch[],
  placeholderMap: Map<number, string>
): NormalizedPlayoffSlot[] {
  const roundOrder: Record<string, number> = {
    "16avos": 1,
    octavos: 2,
    cuartos: 3,
    semifinal: 4,
    final: 5,
  };
  const minRound = matches.reduce(
    (min, m) => Math.min(min, roundOrder[m.round] ?? 999),
    Infinity
  );

  const adjusted = matches.map((m) => ({ ...m }));
  for (const m of adjusted) {
    const value = roundOrder[m.round] ?? 999;
    if (value !== minRound) continue;
    if (m.team1_id) {
      m.source_team1 = placeholderMap.get(m.team1_id) ?? m.source_team1;
      m.team1_id = null;
    }
    if (m.team2_id) {
      m.source_team2 = placeholderMap.get(m.team2_id) ?? m.source_team2;
      m.team2_id = null;
    }
  }

  return normalizePlayoffBracket(adjusted, placeholderMap).filter(
    (m) => (roundOrder[m.round] ?? 99) === minRound
  );
}

export function firstRoundNormalizedSlots(
  matches: PlayoffMatch[],
  labelByTeamId: Map<number, string>
): NormalizedPlayoffSlot[] {
  const roundOrder: Record<string, number> = {
    "16avos": 1,
    octavos: 2,
    cuartos: 3,
    semifinal: 4,
    final: 5,
  };
  const minRound = matches.reduce(
    (min, m) => Math.min(min, roundOrder[m.round] ?? 999),
    Infinity
  );
  return normalizePlayoffBracket(matches, labelByTeamId).filter(
    (m) => (roundOrder[m.round] ?? 99) === minRound
  );
}
