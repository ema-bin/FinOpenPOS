import type { PlayoffMatch } from "@/lib/tournament-playoffs";
import {
  aggregateGroupStandingsFromMatches,
  emptyGroupStandingsStat,
  sortGroupTeamStandings,
  type GroupStandingsInsertRow,
  type GroupStandingsStat,
  type StandingsMatchInput,
} from "@/lib/tournament-group-standings";

export const MASTERS_TEAM_COUNT = 8;
export const MASTERS_QUALIFIERS_PER_GROUP = 2;
export const MASTERS_PLAYOFF_MATCH_COUNT = 3;

/** Misma serpiente que 8 parejas en dos zonas: A = 1,4,5,7 y B = 2,3,6,8 del orden de inscripción. */
const ZONE_A_INDEXES = [0, 3, 4, 6] as const;
const ZONE_B_INDEXES = [1, 2, 5, 7] as const;

export function assignMastersZones(teamIds: readonly number[]): [number[], number[]] {
  if (teamIds.length !== MASTERS_TEAM_COUNT) {
    throw new Error("Un Master necesita exactamente 8 parejas");
  }
  return [
    ZONE_A_INDEXES.map((index) => teamIds[index]),
    ZONE_B_INDEXES.map((index) => teamIds[index]),
  ];
}

/** Todos contra todos. Los dos equipos quedan definidos desde el primer momento. */
export function mastersRoundRobinPairs(teamIds: readonly number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.push([teamIds[i], teamIds[j]]);
    }
  }
  return pairs;
}

/**
 * Tabla de una zona de Master.
 * No usa la posición forzada de la zona de 4 (ganadores / perdedores).
 */
export function rankMastersGroup(
  groupId: number,
  teamIds: number[],
  matches: StandingsMatchInput[]
): GroupStandingsStat[] {
  const aggregated = aggregateGroupStandingsFromMatches(
    matches.map((match) => ({ ...match, tournament_group_id: groupId }))
  );
  const byTeam = aggregated.get(groupId) ?? new Map<number, GroupStandingsStat>();
  const stats = teamIds.map(
    (teamId) => byTeam.get(teamId) ?? emptyGroupStandingsStat(teamId)
  );
  return sortGroupTeamStandings(stats, null);
}

export function buildMastersStandingsInsertRows(
  tournamentGroupId: number,
  userUid: string,
  teamIds: number[],
  matches: StandingsMatchInput[]
): GroupStandingsInsertRow[] {
  return rankMastersGroup(tournamentGroupId, teamIds, matches).map((stat, index) => ({
    tournament_group_id: tournamentGroupId,
    team_id: stat.team_id,
    user_uid: userUid,
    matches_played: stat.matches_played,
    wins: stat.wins,
    losses: stat.losses,
    sets_won: stat.sets_won,
    sets_lost: stat.sets_lost,
    games_won: stat.games_won,
    games_lost: stat.games_lost,
    position: index + 1,
  }));
}

export type MastersQualifier = {
  team_id: number;
  from_group_id: number;
  pos: number;
  group_order: number;
};

export function mastersQualifiersForGroup(
  groupId: number,
  groupOrder: number,
  teamIds: number[],
  matches: StandingsMatchInput[]
): MastersQualifier[] {
  return rankMastersGroup(groupId, teamIds, matches)
    .slice(0, MASTERS_QUALIFIERS_PER_GROUP)
    .map((stat, index) => ({
      team_id: stat.team_id,
      from_group_id: groupId,
      pos: index + 1,
      group_order: groupOrder,
    }));
}

function slotLabel(pos: number, groupOrder: number): string {
  const letter =
    groupOrder >= 1 && groupOrder <= 26
      ? String.fromCharCode(64 + groupOrder)
      : "?";
  return `${pos}${letter}`;
}

function findQualifier(
  qualifiers: MastersQualifier[],
  pos: number,
  groupOrder: number
): MastersQualifier | undefined {
  return qualifiers.find(
    (qualifier) => qualifier.pos === pos && qualifier.group_order === groupOrder
  );
}

/**
 * Semis cruzadas (1A vs 2B, 1B vs 2A) y final entre ganadores.
 * No hay partido por el tercer puesto.
 */
export function buildMastersPlayoffMatches(
  qualifiers: MastersQualifier[],
  options?: { slotLabels?: boolean }
): PlayoffMatch[] {
  const useLabels = options?.slotLabels === true;
  const pair = (
    bracketPos: number,
    first: { pos: number; groupOrder: number },
    second: { pos: number; groupOrder: number }
  ): PlayoffMatch => {
    const team1 = findQualifier(qualifiers, first.pos, first.groupOrder);
    const team2 = findQualifier(qualifiers, second.pos, second.groupOrder);
    if (useLabels) {
      return {
        round: "semifinal",
        bracket_pos: bracketPos,
        team1_id: null,
        team2_id: null,
        source_team1: slotLabel(first.pos, first.groupOrder),
        source_team2: slotLabel(second.pos, second.groupOrder),
      };
    }
    return {
      round: "semifinal",
      bracket_pos: bracketPos,
      team1_id: team1?.team_id ?? null,
      team2_id: team2?.team_id ?? null,
      source_team1: team1 ? null : slotLabel(first.pos, first.groupOrder),
      source_team2: team2 ? null : slotLabel(second.pos, second.groupOrder),
    };
  };

  return [
    pair(1, { pos: 1, groupOrder: 1 }, { pos: 2, groupOrder: 2 }),
    pair(2, { pos: 1, groupOrder: 2 }, { pos: 2, groupOrder: 1 }),
    {
      round: "final",
      bracket_pos: 1,
      team1_id: null,
      team2_id: null,
      source_team1: "Ganador Semifinal1",
      source_team2: "Ganador Semifinal2",
    },
  ];
}

export function projectedMastersPlayoffMatches(): PlayoffMatch[] {
  return buildMastersPlayoffMatches([], { slotLabels: true });
}
