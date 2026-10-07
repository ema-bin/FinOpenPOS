import { describe, expect, it } from "vitest";
import { PREDEFINED_FIRST_ROUND_BRACKETS } from "@/lib/playoff-first-round-brackets";

const EXPECTED_KEYS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 30] as const;

describe("playoff-first-round-brackets (lib)", () => {
  it.each(EXPECTED_KEYS)("torneo %i parejas: plantilla con bracket_pos consecutivos", (pairs) => {
    const bracket = PREDEFINED_FIRST_ROUND_BRACKETS[pairs];
    expect(bracket).toBeDefined();
    expect(bracket.length).toBeGreaterThan(0);
    for (const m of bracket) {
      expect(m.team1).toMatch(/^[123][A-Z]$/);
      if (m.team2 != null) {
        expect(m.team2).toMatch(/^[123][A-Z]$/);
      }
    }
  });

  it("13 parejas: muchos byes en primera ronda", () => {
    const bracket = PREDEFINED_FIRST_ROUND_BRACKETS[13];
    const byes = bracket.filter((m) => m.team2 == null).length;
    expect(byes).toBeGreaterThanOrEqual(4);
  });

  it("12 parejas: cuartos sin byes (todos los cruces tienen rival)", () => {
    const bracket = PREDEFINED_FIRST_ROUND_BRACKETS[12];
    expect(bracket.every((m) => m.team2 != null)).toBe(true);
    expect(bracket).toHaveLength(4);
  });
});
