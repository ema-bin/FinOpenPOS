import {
  buildTeamDisplayOrderMap,
  sortTeamIdsWithZoneHeadFirst,
} from "@/lib/group-zone-team-order";

export type GroupOfFourPairingPreset = "1-4_2-3" | "1-2_3-4" | "1-3_2-4";

export type GroupOfFourFirstRoundPairing = {
  match1: [number, number];
  match2: [number, number];
};

export const GROUP_OF_FOUR_PAIRING_PRESETS: {
  id: GroupOfFourPairingPreset;
  label: string;
}[] = [
  { id: "1-4_2-3", label: "1 vs 4 / 2 vs 3" },
  { id: "1-2_3-4", label: "1 vs 2 / 3 vs 4" },
  { id: "1-3_2-4", label: "1 vs 3 / 2 vs 4" },
];

export function orderGroupOfFourTeamIds(
  teamIds: number[],
  teams: Array<{ id: number; display_order?: number | null }>
): number[] {
  if (teamIds.length !== 4) {
    throw new Error("Se necesitan exactamente 4 equipos en la zona");
  }
  const displayOrderByTeamId = buildTeamDisplayOrderMap(teams);
  return sortTeamIdsWithZoneHeadFirst(teamIds, displayOrderByTeamId);
}

export function pairingFromPreset(
  orderedTeamIds: [number, number, number, number],
  preset: GroupOfFourPairingPreset
): GroupOfFourFirstRoundPairing {
  const [t1, t2, t3, t4] = orderedTeamIds;
  switch (preset) {
    case "1-4_2-3":
      return { match1: [t1, t4], match2: [t2, t3] };
    case "1-2_3-4":
      return { match1: [t1, t2], match2: [t3, t4] };
    case "1-3_2-4":
      return { match1: [t1, t3], match2: [t2, t4] };
    default:
      return { match1: [t1, t4], match2: [t2, t3] };
  }
}

/** Detecta preset si los cruces coinciden con 1..4 por orden de seed en zona. */
export function detectGroupOfFourPairingPreset(
  orderedTeamIds: [number, number, number, number],
  match1: [number, number],
  match2: [number, number]
): GroupOfFourPairingPreset | null {
  const samePair = (a: [number, number], b: [number, number]) =>
    (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

  for (const preset of GROUP_OF_FOUR_PAIRING_PRESETS) {
    const expected = pairingFromPreset(orderedTeamIds, preset.id);
    if (
      samePair(match1, expected.match1) &&
      samePair(match2, expected.match2)
    ) {
      return preset.id;
    }
  }
  return null;
}

export function pairingFromMatch1Teams(
  teamIds: number[],
  match1TeamA: number,
  match1TeamB: number
): GroupOfFourFirstRoundPairing | null {
  if (teamIds.length !== 4) return null;
  if (match1TeamA === match1TeamB) return null;
  const set = new Set(teamIds);
  if (!set.has(match1TeamA) || !set.has(match1TeamB)) return null;
  const rest = teamIds.filter((id) => id !== match1TeamA && id !== match1TeamB);
  if (rest.length !== 2) return null;
  return {
    match1: [match1TeamA, match1TeamB],
    match2: [rest[0], rest[1]],
  };
}

type GroupOfFourMatchPayload = {
  tournament_id: number;
  user_uid: string;
  phase: "group";
  tournament_group_id: number;
  team1_id: number | null;
  team2_id: number | null;
  match_date: null;
  start_time: null;
  end_time: null;
  match_order: number;
  court_id: null;
};

export function buildGroupOfFourMatchPayloads(
  tournamentId: number,
  userUid: string,
  groupId: number,
  orderedTeamIds: number[],
  pairing: GroupOfFourFirstRoundPairing
): GroupOfFourMatchPayload[] {
  const base = {
    tournament_id: tournamentId,
    user_uid: userUid,
    phase: "group" as const,
    tournament_group_id: groupId,
    match_date: null as null,
    start_time: null as null,
    end_time: null as null,
    court_id: null as null,
  };

  return [
    {
      ...base,
      team1_id: pairing.match1[0],
      team2_id: pairing.match1[1],
      match_order: 1,
    },
    {
      ...base,
      team1_id: pairing.match2[0],
      team2_id: pairing.match2[1],
      match_order: 2,
    },
    {
      ...base,
      team1_id: null,
      team2_id: null,
      match_order: 3,
    },
    {
      ...base,
      team1_id: null,
      team2_id: null,
      match_order: 4,
    },
  ];
}

export function buildDefaultGroupOfFourMatchPayloads(
  tournamentId: number,
  userUid: string,
  groupId: number,
  orderedTeamIds: number[]
): GroupOfFourMatchPayload[] {
  const pairing = pairingFromPreset(
    orderedTeamIds as [number, number, number, number],
    "1-4_2-3"
  );
  return buildGroupOfFourMatchPayloads(
    tournamentId,
    userUid,
    groupId,
    orderedTeamIds,
    pairing
  );
}
