import { describe, expect, it } from "vitest";
import { splitMasterRanking } from "@/lib/master-ranking-cutoff";

describe("splitMasterRanking", () => {
  const rows = [
    { player_id: 1, tournaments_played: 8 },
    { player_id: 2, tournaments_played: 3 },
    { player_id: 3, tournaments_played: 6 },
    { player_id: 4, tournaments_played: 4 },
  ];

  it("deja afuera a quien no supera el mínimo y respeta el orden del ranking", () => {
    const result = splitMasterRanking(rows, 4, 2);
    expect(result.qualifiers.map((row) => row.player_id)).toEqual([1, 3]);
    expect(result.substitutes).toEqual([]);
  });

  it("los que pasan del cupo quedan como suplentes", () => {
    const many = Array.from({ length: 18 }, (_, index) => ({
      player_id: index + 1,
      tournaments_played: 5,
    }));
    const result = splitMasterRanking(many, 4);
    expect(result.qualifiers).toHaveLength(16);
    expect(result.qualifiers[0].player_id).toBe(1);
    expect(result.qualifiers[15].player_id).toBe(16);
    expect(result.substitutes.map((row) => row.player_id)).toEqual([17, 18]);
  });

  it("no cuenta a quien tiene exactamente el mínimo", () => {
    const result = splitMasterRanking([{ player_id: 9, tournaments_played: 4 }], 4);
    expect(result.qualifiers).toEqual([]);
    expect(result.substitutes).toEqual([]);
  });
});
