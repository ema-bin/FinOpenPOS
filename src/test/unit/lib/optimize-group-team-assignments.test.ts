import { describe, expect, it } from "vitest";
import {
  compareAssignmentScores,
  optimizeGroupTeamAssignments,
  type AssignmentScore,
} from "@/lib/optimize-group-team-assignments";

function groupOfThreeMatches(groupId: number, teams: [number, number, number]) {
  const [a, b, c] = teams;
  return [
    { tournament_group_id: groupId, team1_id: a, team2_id: b },
    { tournament_group_id: groupId, team1_id: a, team2_id: c },
    { tournament_group_id: groupId, team1_id: b, team2_id: c },
  ];
}

describe("optimize-group-team-assignments (lib)", () => {
  it("compareAssignmentScores prioriza menos partidos infactibles", () => {
    const better: AssignmentScore = {
      infeasibleMatches: 0,
      minMatchViableSlots: 1,
      totalViableSlots: 3,
      worstPairCompatibilityPct: 50,
    };
    const worse: AssignmentScore = {
      infeasibleMatches: 2,
      minMatchViableSlots: 0,
      totalViableSlots: 0,
      worstPairCompatibilityPct: 100,
    };
    expect(compareAssignmentScores(better, worse)).toBeGreaterThan(0);
    expect(compareAssignmentScores(worse, better)).toBeLessThan(0);
  });

  it("intercambia parejas entre zonas de 3 para eliminar cruces infactibles", () => {
    const group1Teams: [number, number, number] = [1, 2, 3];
    const group2Teams: [number, number, number] = [4, 5, 6];

    const result = optimizeGroupTeamAssignments({
      groups: [{ id: 10 }, { id: 20 }],
      groupTeams: [
        { teamId: 1, groupId: 10, restrictedSlotIds: [2, 3], isFixedHead: false },
        { teamId: 2, groupId: 10, restrictedSlotIds: [1, 3], isFixedHead: false },
        { teamId: 3, groupId: 10, restrictedSlotIds: [1, 2], isFixedHead: false },
        { teamId: 4, groupId: 20, restrictedSlotIds: [], isFixedHead: false },
        { teamId: 5, groupId: 20, restrictedSlotIds: [], isFixedHead: false },
        { teamId: 6, groupId: 20, restrictedSlotIds: [], isFixedHead: false },
      ],
      matches: [
        ...groupOfThreeMatches(10, group1Teams),
        ...groupOfThreeMatches(20, group2Teams),
      ],
      allSlotIds: [1, 2, 3],
    });

    expect(result.scoreBefore.infeasibleMatches).toBe(3);
    expect(result.improved).toBe(true);
    expect(result.scoreAfter.infeasibleMatches).toBeLessThan(
      result.scoreBefore.infeasibleMatches
    );
    expect(result.swaps.length).toBeGreaterThan(0);
  });

  it("no mueve cabezas de zona fijas", () => {
    const result = optimizeGroupTeamAssignments({
      groups: [{ id: 1 }, { id: 2 }],
      groupTeams: [
        { teamId: 1, groupId: 1, restrictedSlotIds: [2, 3], isFixedHead: true },
        { teamId: 2, groupId: 1, restrictedSlotIds: [1, 3], isFixedHead: false },
        { teamId: 3, groupId: 1, restrictedSlotIds: [1, 2], isFixedHead: false },
        { teamId: 4, groupId: 2, restrictedSlotIds: [], isFixedHead: false },
        { teamId: 5, groupId: 2, restrictedSlotIds: [], isFixedHead: false },
        { teamId: 6, groupId: 2, restrictedSlotIds: [], isFixedHead: false },
      ],
      matches: [
        ...groupOfThreeMatches(1, [1, 2, 3]),
        ...groupOfThreeMatches(2, [4, 5, 6]),
      ],
      allSlotIds: [1, 2, 3],
    });

    for (const swap of result.swaps) {
      expect(swap.team1Id).not.toBe(1);
      expect(swap.team2Id).not.toBe(1);
    }
  });
});
