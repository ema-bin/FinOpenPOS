import { describe, expect, it } from "vitest";
import type { GroupMatchPayload } from "@/lib/tournament-scheduler";
import { scheduleGroupMatchesWithRestrictions } from "@/lib/tournament-scheduler-with-restrictions";
import { assignmentSatisfiesTeamRest } from "@/lib/team-match-rest-constraint";

const BASE: Omit<GroupMatchPayload, "tournament_group_id" | "team1_id" | "team2_id" | "match_order"> = {
  tournament_id: 1,
  user_uid: "test-user",
  phase: "group",
  match_date: null,
  start_time: null,
  end_time: null,
  court_id: null,
};

function groupOfThreeMatches(groupId: number, teams: [number, number, number]): GroupMatchPayload[] {
  const [a, b, c] = teams;
  return [
    { ...BASE, tournament_group_id: groupId, team1_id: a, team2_id: b },
    { ...BASE, tournament_group_id: groupId, team1_id: a, team2_id: c },
    { ...BASE, tournament_group_id: groupId, team1_id: b, team2_id: c },
  ];
}

function groupOfFourMatches(groupId: number, teams: [number, number, number, number]): GroupMatchPayload[] {
  const [a, b, c, d] = teams;
  return [
    { ...BASE, tournament_group_id: groupId, team1_id: a, team2_id: d, match_order: 1 },
    { ...BASE, tournament_group_id: groupId, team1_id: b, team2_id: c, match_order: 2 },
    { ...BASE, tournament_group_id: groupId, team1_id: null, team2_id: null, match_order: 3 },
    { ...BASE, tournament_group_id: groupId, team1_id: null, team2_id: null, match_order: 4 },
  ];
}

function orderedSlotsForGroup(
  groupId: number,
  matches: GroupMatchPayload[],
  assignments: { matchIdx: number; date: string; startTime: string }[]
): Array<{ datetime: Date }> {
  const groupMatches = matches.filter((m) => m.tournament_group_id === groupId);
  return groupMatches.map((match) => {
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

describe("scheduleGroupMatchesWithRestrictions (lib)", () => {
  it("falla sin canchas", async () => {
    const result = await scheduleGroupMatchesWithRestrictions(
      groupOfThreeMatches(1, [1, 2, 3]),
      [{ date: "2026-06-05", startTime: "10:00", endTime: "18:00" }],
      60,
      []
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/canchas/i);
  });

  it("falla en modo legacy sin días", async () => {
    const result = await scheduleGroupMatchesWithRestrictions(
      groupOfThreeMatches(1, [1, 2, 3]),
      [],
      60,
      [1]
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/horarios/i);
  });

  it("falla si no hay slots suficientes (modo torneo)", async () => {
    const result = await scheduleGroupMatchesWithRestrictions(
      groupOfThreeMatches(10, [1, 2, 3]),
      [],
      60,
      [1],
      undefined,
      undefined,
      undefined,
      [{ id: 1, slot_date: "2026-06-05", start_time: "10:00", end_time: "11:00" }],
      new Map([[1, new Set()], [2, new Set()], [3, new Set()]])
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/suficientes slots/i);
  });

  it("asigna zona de 3 con slots del torneo respetando descanso por pareja", async () => {
    const matches = groupOfThreeMatches(100, [10, 20, 30]);
    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [],
      60,
      [1],
      undefined,
      undefined,
      undefined,
      [
        { id: 1, slot_date: "2026-06-05", start_time: "10:00", end_time: "11:00" },
        { id: 2, slot_date: "2026-06-05", start_time: "12:00", end_time: "13:00" },
        { id: 3, slot_date: "2026-06-05", start_time: "14:00", end_time: "15:00" },
      ],
      new Map([
        [10, new Set<number>()],
        [20, new Set<number>()],
        [30, new Set<number>()],
      ])
    );

    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(3);

    const slotsOrdered = orderedSlotsForGroup(100, matches, result.assignments);
    const group = {
      size: 3 as const,
      teams: [10, 20, 30],
      matches: matches.filter((m) => m.tournament_group_id === 100),
    };
    expect(assignmentSatisfiesTeamRest(slotsOrdered, group, 60 * 60 * 1000)).toBe(true);
  });

  it("asigna zona de 4 con dos canchas en el mismo horario de 1ª ronda", async () => {
    const matches = groupOfFourMatches(200, [1, 2, 3, 4]);
    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [],
      60,
      [1, 2],
      undefined,
      undefined,
      undefined,
      [
        { id: 1, slot_date: "2026-06-05", start_time: "10:00", end_time: "11:00" },
        { id: 2, slot_date: "2026-06-05", start_time: "12:00", end_time: "13:00" },
      ],
      new Map([
        [1, new Set<number>()],
        [2, new Set<number>()],
        [3, new Set<number>()],
        [4, new Set<number>()],
      ])
    );

    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(4);

    const slotsOrdered = orderedSlotsForGroup(200, matches, result.assignments);
    const group = {
      size: 4 as const,
      teams: [1, 2, 3, 4],
      matches: matches
        .filter((m) => m.tournament_group_id === 200)
        .sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0)),
    };
    expect(assignmentSatisfiesTeamRest(slotsOrdered, group, 60 * 60 * 1000)).toBe(true);
  });

  it("usa horarios de respaldo cuando can_play deja un solo horario viable", async () => {
    const matches = groupOfThreeMatches(300, [1, 2, 3]);
    const cannotPlay = new Set([1, 2]);
    const logs: string[] = [];
    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [],
      60,
      [1],
      undefined,
      undefined,
      (msg) => logs.push(msg),
      [
        { id: 1, slot_date: "2026-06-05", start_time: "10:00", end_time: "11:00" },
        { id: 2, slot_date: "2026-06-05", start_time: "12:00", end_time: "13:00" },
        { id: 3, slot_date: "2026-06-05", start_time: "14:00", end_time: "15:00" },
      ],
      new Map([
        [1, cannotPlay],
        [2, cannotPlay],
        [3, cannotPlay],
      ])
    );

    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(3);
    expect(logs.some((l) => /respald/i.test(l))).toBe(true);
  });

  it("modo legacy respeta teamRestrictions cuando hay slots de sobra", async () => {
    const matches = groupOfThreeMatches(301, [1, 2, 3]);
    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [{ date: "2026-06-05", startTime: "09:00", endTime: "18:00" }],
      60,
      [1],
      undefined,
      new Map([
        [
          1,
          [{ date: "2026-06-05", start_time: "09:00", end_time: "11:00" }],
        ],
      ])
    );

    expect(result.success).toBe(true);
    const team1MatchIdx = matches
      .map((m, i) => (m.team1_id === 1 || m.team2_id === 1 ? i : -1))
      .filter((i) => i >= 0);
    for (const a of result.assignments) {
      if (!team1MatchIdx.includes(a.matchIdx)) continue;
      expect(a.startTime.slice(0, 5) >= "11:00").toBe(true);
    }
  });

  it("modo legacy con días genera asignación para zona de 3", async () => {
    const matches = groupOfThreeMatches(400, [5, 6, 7]);
    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [{ date: "2026-06-05", startTime: "09:00", endTime: "15:00" }],
      60,
      [1]
    );

    expect(result.success).toBe(true);
    expect(result.assignments.length).toBeGreaterThanOrEqual(3);
    for (const a of result.assignments) {
      expect(a.date).toBe("2026-06-05");
      expect(a.courtId).toBe(1);
    }
  });
});
