import { describe, expect, it } from "vitest";
import {
  isPlayerCategoryEligibleForTournamentByMeta,
  resolvePlayerCategoryIdForTournament,
} from "@/lib/tournament-category-eligibility";

describe("tournament-category-eligibility (lib)", () => {
  const meta = new Map([
    [1, { display_order: 8, type: "libre" as const, name: "8va" }],
    [2, { display_order: 5, type: "libre" as const, name: "5ta" }],
    [3, { display_order: 7, type: "damas" as const, name: "7ma damas" }],
  ]);

  it("resolvePlayerCategoryIdForTournament elige categoría libre", () => {
    expect(
      resolvePlayerCategoryIdForTournament(
        { id: 1, first_name: "A", last_name: "B", category_id: 1 },
        "libre",
        meta
      )
    ).toBe(1);
  });

  it("isPlayerCategoryEligibleForTournamentByMeta exige mismo tipo de categoría", () => {
    const libre = meta.get(1)!;
    const damas = meta.get(3)!;
    expect(isPlayerCategoryEligibleForTournamentByMeta(libre, damas)).toBe(false);
    expect(isPlayerCategoryEligibleForTournamentByMeta(libre, libre)).toBe(true);
  });
});
