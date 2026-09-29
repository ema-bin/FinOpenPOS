import { describe, expect, it } from "vitest";
import {
  assignmentSatisfiesTeamRest,
  slotsSatisfyTeamRest,
} from "@/lib/team-match-rest-constraint";

const MS = 60 * 60 * 1000;
const mk = (h: number) => ({ datetime: new Date(`2026-06-05T${String(h).padStart(2, "0")}:00:00`) });

describe("team-match-rest-constraint (lib)", () => {
  it("rechaza partidos seguidos en el mismo horario", () => {
    expect(slotsSatisfyTeamRest(mk(19), mk(20), MS)).toBe(false);
  });

  it("acepta descanso de al menos una duración", () => {
    expect(slotsSatisfyTeamRest(mk(19), mk(21), MS)).toBe(true);
  });

  it("valida zona de 3 equipos", () => {
    const group = {
      size: 3 as const,
      teams: [1, 2, 3],
      matches: [
        { team1_id: 1, team2_id: 2 },
        { team1_id: 1, team2_id: 3 },
        { team1_id: 2, team2_id: 3 },
      ],
    };
    expect(assignmentSatisfiesTeamRest([mk(19), mk(21), mk(23)], group, MS)).toBe(true);
    expect(assignmentSatisfiesTeamRest([mk(19), mk(20), mk(23)], group, MS)).toBe(false);
  });
});
