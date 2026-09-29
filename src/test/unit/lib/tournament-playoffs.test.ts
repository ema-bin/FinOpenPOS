import { describe, expect, it } from "vitest";
import { calculateFirstRound } from "@/lib/tournament-playoffs";
import { PREDEFINED_FIRST_ROUND_BRACKETS } from "@/lib/playoff-first-round-brackets";

describe("tournament-playoffs (lib)", () => {
  it("calculateFirstRound para 8 clasificados", () => {
    const r = calculateFirstRound(8);
    expect(r.teamsPlaying).toBe(8);
    expect(r.teamsWithBye).toBe(0);
    expect(r.nextRoundSize).toBe(4);
    expect(r.firstRoundName).toBe("cuartos");
  });

  it("calculateFirstRound asigna byes cuando corresponde", () => {
    const r = calculateFirstRound(12);
    expect(r.teamsPlaying + r.teamsWithBye).toBe(12);
    expect(r.teamsPlaying % 2).toBe(0);
    expect(r.nextRoundSize).toBeGreaterThanOrEqual(4);
  });
});

describe("playoff-first-round-brackets (lib)", () => {
  it("define plantillas para rangos habituales de parejas", () => {
    expect(PREDEFINED_FIRST_ROUND_BRACKETS[8]).toHaveLength(4);
    expect(PREDEFINED_FIRST_ROUND_BRACKETS[12]).toHaveLength(4);
    expect(PREDEFINED_FIRST_ROUND_BRACKETS[8][0]).toEqual({ team1: "1A", team2: null });
  });
});
