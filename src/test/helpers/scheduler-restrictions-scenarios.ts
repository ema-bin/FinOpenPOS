import { expect } from "vitest";
import type { GroupMatchPayload } from "@/lib/tournament-scheduler";
import type { TournamentSlotInput } from "@/lib/tournament-scheduler";
import { computeGroupSizes } from "@/lib/tournament-group-sizes";
import { scheduleGroupMatchesWithRestrictions } from "@/lib/tournament-scheduler-with-restrictions";
import { assignmentSatisfiesTeamRest } from "@/lib/team-match-rest-constraint";

const BASE: Omit<
  GroupMatchPayload,
  "tournament_group_id" | "team1_id" | "team2_id" | "match_order"
> = {
  tournament_id: 1,
  user_uid: "test-user",
  phase: "group",
  match_date: null,
  start_time: null,
  end_time: null,
  court_id: null,
};

export type RestrictionStrictness = "none" | "moderate" | "severe" | "extreme";

export function groupOfThreeMatches(
  groupId: number,
  teams: [number, number, number]
): GroupMatchPayload[] {
  const [a, b, c] = teams;
  return [
    { ...BASE, tournament_group_id: groupId, team1_id: a, team2_id: b },
    { ...BASE, tournament_group_id: groupId, team1_id: a, team2_id: c },
    { ...BASE, tournament_group_id: groupId, team1_id: b, team2_id: c },
  ];
}

export function groupOfFourMatches(
  groupId: number,
  teams: [number, number, number, number]
): GroupMatchPayload[] {
  const [a, b, c, d] = teams;
  return [
    { ...BASE, tournament_group_id: groupId, team1_id: a, team2_id: d, match_order: 1 },
    { ...BASE, tournament_group_id: groupId, team1_id: b, team2_id: c, match_order: 2 },
    { ...BASE, tournament_group_id: groupId, team1_id: null, team2_id: null, match_order: 3 },
    { ...BASE, tournament_group_id: groupId, team1_id: null, team2_id: null, match_order: 4 },
  ];
}

/** Partidos de todas las zonas para N parejas activas (misma lógica que el torneo). */
export function buildMatchesForActiveTeams(activeTeamCount: number): {
  matches: GroupMatchPayload[];
  teamIds: number[];
  groupSizes: number[];
} {
  const groupSizes = computeGroupSizes(activeTeamCount);
  if (groupSizes.length === 0) {
    throw new Error(`Menos de 3 equipos: ${activeTeamCount}`);
  }

  const matches: GroupMatchPayload[] = [];
  const teamIds: number[] = [];
  let nextTeamId = 1;

  groupSizes.forEach((size, index) => {
    const groupId = index + 1;
    const teamsInGroup: number[] = [];
    for (let i = 0; i < size; i++) {
      const id = nextTeamId++;
      teamsInGroup.push(id);
      teamIds.push(id);
    }
    if (size === 3) {
      matches.push(
        ...groupOfThreeMatches(groupId, teamsInGroup as [number, number, number])
      );
    } else {
      matches.push(
        ...groupOfFourMatches(groupId, teamsInGroup as [number, number, number, number])
      );
    }
  });

  return { matches, teamIds, groupSizes };
}

const DEFAULT_TIMES = [
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
  "20:00",
];

/** Grilla de slots del torneo con ids 1..N (una fila por día+hora; las canchas las expande el scheduler). */
export function buildTournamentSlotGrid(input: {
  days: string[];
  times?: string[];
  /** Reservado para compatibilidad en tests; no duplica filas de slot. */
  courtIds?: number[];
}): TournamentSlotInput[] {
  const times = input.times ?? DEFAULT_TIMES;
  const slots: TournamentSlotInput[] = [];
  let id = 1;
  for (const day of input.days) {
    for (const start of times) {
      const [h, m] = start.split(":").map(Number);
      const endH = h + 1;
      const end = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      slots.push({
        id: id++,
        slot_date: day,
        start_time: start,
        end_time: end,
      });
    }
  }
  return slots;
}

/**
 * Grilla acotada al tamaño del torneo (evita C(n,4) enorme en el beam search con grillas “de producción”).
 */
export function buildCompactTournamentSlotGrid(input: {
  activeTeamCount: number;
  courtIds?: number[];
  startDay?: string;
}): { tournamentSlots: TournamentSlotInput[]; courtIds: number[] } {
  const { matches, groupSizes } = buildMatchesForActiveTeams(input.activeTeamCount);
  const totalMatches = matches.length;
  const slack = groupSizes.length * 3 + 10;
  const minPhysicalSlots = totalMatches + slack;
  const courtIds = input.courtIds ?? (totalMatches <= 20 ? [1, 2] : [1]);

  const times = DEFAULT_TIMES;
  const slotsPerDay = times.length;
  const physicalPerDay = slotsPerDay * courtIds.length;
  const start = input.startDay ?? "2026-07-01";
  const days: string[] = [];
  let physicalCount = 0;
  let dayOffset = 0;
  while (physicalCount < minPhysicalSlots) {
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + dayOffset);
    days.push(d.toISOString().slice(0, 10));
    physicalCount += physicalPerDay;
    dayOffset++;
    if (dayOffset > 14) break;
  }

  return {
    tournamentSlots: buildTournamentSlotGrid({ days }),
    courtIds,
  };
}

export function tournamentSlotIdByDateTime(
  slots: TournamentSlotInput[],
  date: string,
  startTime: string
): number | undefined {
  const norm = startTime.slice(0, 5);
  return slots.find(
    (s) => s.slot_date === date && s.start_time.slice(0, 5) === norm
  )?.id;
}

export function buildTeamCannotPlayMap(
  teamIds: number[],
  slotIds: number[],
  strictness: RestrictionStrictness
): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const teamId of teamIds) {
    const blocked = new Set<number>();
    for (const slotId of slotIds) {
      if (strictness === "none") continue;
      if (strictness === "moderate") {
        if ((teamId * 13 + slotId * 7) % 17 === 0) blocked.add(slotId);
      }
      if (strictness === "severe") {
        // Más bloqueos que moderate (~2×), pero sin colapsar a 2 horarios globales.
        if ((teamId * 17 + slotId * 11) % 19 === 0) blocked.add(slotId);
      }
      if (strictness === "extreme") {
        if (slotId !== slotIds[slotIds.length - 1] && slotId !== slotIds[slotIds.length - 2]) {
          blocked.add(slotId);
        }
      }
    }
    map.set(teamId, blocked);
  }
  return map;
}

function teamsForMatch(
  matches: GroupMatchPayload[],
  matchIdx: number
): number[] {
  const m = matches[matchIdx];
  const groupMatches = matches.filter(
    (x) => x.tournament_group_id === m.tournament_group_id
  );
  const hasOrder = groupMatches.some((x) => x.match_order != null);
  if (hasOrder && (m.match_order === 3 || m.match_order === 4)) {
    const ids = new Set<number>();
    for (const gm of groupMatches) {
      if (gm.team1_id != null) ids.add(gm.team1_id);
      if (gm.team2_id != null) ids.add(gm.team2_id);
    }
    return Array.from(ids);
  }
  const out: number[] = [];
  if (m.team1_id != null) out.push(m.team1_id);
  if (m.team2_id != null) out.push(m.team2_id);
  return out;
}

export function orderedSlotsForGroup(
  groupId: number,
  matches: GroupMatchPayload[],
  assignments: Array<{ matchIdx: number; date: string; startTime: string }>
): Array<{ datetime: Date }> {
  const groupMatches = matches.filter((m) => m.tournament_group_id === groupId);
  const hasOrder = groupMatches.some((m) => m.match_order != null);
  const ordered = hasOrder
    ? [...groupMatches].sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0))
    : groupMatches;

  return ordered.map((match) => {
    const matchIdx = matches.findIndex(
      (m) =>
        m.tournament_group_id === match.tournament_group_id &&
        m.team1_id === match.team1_id &&
        m.team2_id === match.team2_id &&
        m.match_order === match.match_order
    );
    const row = assignments.find((a) => a.matchIdx === matchIdx);
    if (!row) throw new Error(`sin asignación para partido idx ${matchIdx}`);
    return { datetime: new Date(`${row.date}T${row.startTime}:00`) };
  });
}

export type ScheduleHealthExpectation = {
  matches: GroupMatchPayload[];
  teamIds: number[];
  tournamentSlots: TournamentSlotInput[];
  teamCannotPlay: Map<number, Set<number>>;
  matchDurationMinutes?: number;
  allowFallback?: boolean;
};

export function assertSuccessfulSchedule(
  result: Awaited<ReturnType<typeof scheduleGroupMatchesWithRestrictions>>,
  logs: string[],
  health: ScheduleHealthExpectation
): void {
  const durationMs = (health.matchDurationMinutes ?? 60) * 60 * 1000;
  const usedPhysical = new Set<string>();
  const expectedMatchCount = health.matches.length;

  expect(result.success).toBe(true);
  expect(result.assignments).toHaveLength(expectedMatchCount);

  const usedFallback = logs.some((l) => /respald/i.test(l));
  if (!health.allowFallback) {
    expect(usedFallback).toBe(false);
  }

  for (const a of result.assignments) {
    const key = `${a.date}|${a.startTime.slice(0, 5)}|${a.courtId}`;
    expect(usedPhysical.has(key)).toBe(false);
    usedPhysical.add(key);

    if (!usedFallback) {
      const slotId = tournamentSlotIdByDateTime(
        health.tournamentSlots,
        a.date,
        a.startTime
      );
      if (slotId != null) {
        for (const tid of teamsForMatch(health.matches, a.matchIdx)) {
          expect(health.teamCannotPlay.get(tid)?.has(slotId)).not.toBe(true);
        }
      }
    }
  }

  const groupIds = [
    ...new Set(health.matches.map((m) => m.tournament_group_id)),
  ];
  for (const groupId of groupIds) {
    const groupMatches = health.matches.filter(
      (m) => m.tournament_group_id === groupId
    );
    const teams = new Set<number>();
    for (const m of groupMatches) {
      if (m.team1_id != null) teams.add(m.team1_id);
      if (m.team2_id != null) teams.add(m.team2_id);
    }
    const size = groupMatches.some((m) => m.match_order != null) ? 4 : 3;
    const slotsOrdered = orderedSlotsForGroup(
      groupId,
      health.matches,
      result.assignments
    );
    const group = {
      size: size as 3 | 4,
      teams: Array.from(teams),
      matches: size === 4 ? [...groupMatches].sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0)) : groupMatches,
    };
    expect(assignmentSatisfiesTeamRest(slotsOrdered, group, durationMs)).toBe(
      true
    );
  }
}

export async function runTournamentSlotSchedule(input: {
  activeTeamCount: number;
  strictness: RestrictionStrictness;
  courtIds?: number[];
  days?: string[];
  allowFallback?: boolean;
}): Promise<{
  result: Awaited<ReturnType<typeof scheduleGroupMatchesWithRestrictions>>;
  logs: string[];
  health: ScheduleHealthExpectation;
}> {
  const { matches, teamIds } = buildMatchesForActiveTeams(input.activeTeamCount);
  const compact =
    input.days == null && input.courtIds == null
      ? buildCompactTournamentSlotGrid({ activeTeamCount: input.activeTeamCount })
      : null;
  const courtIds =
    input.courtIds ?? compact?.courtIds ?? [1, 2];
  const tournamentSlots =
    compact?.tournamentSlots ??
    buildTournamentSlotGrid({
      days:
        input.days ?? [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
        ],
      courtIds,
    });
  const slotIds = tournamentSlots.map((s) => s.id);
  const teamCannotPlay = buildTeamCannotPlayMap(
    teamIds,
    slotIds,
    input.strictness
  );

  const logs: string[] = [];
  const result = await scheduleGroupMatchesWithRestrictions(
    matches,
    [],
    60,
    courtIds,
    undefined,
    undefined,
    (msg) => logs.push(msg),
    tournamentSlots,
    teamCannotPlay,
    undefined,
    undefined,
  );

  const health: ScheduleHealthExpectation = {
    matches,
    teamIds,
    tournamentSlots,
    teamCannotPlay,
    allowFallback: input.allowFallback,
  };

  return { result, logs, health };
}
