import { describe, expect, it } from "vitest";
import {
  buildProjectedQualifiedTeams,
  computeGroupSizes,
} from "@/lib/tournament-group-sizes";

describe("tournament-group-sizes (lib)", () => {
  it("computeGroupSizes devuelve vacío con menos de 3 equipos", () => {
    expect(computeGroupSizes(0)).toEqual([]);
    expect(computeGroupSizes(2)).toEqual([]);
  });

  it("computeGroupSizes reparte zonas de 3 y convierte resto 1 en zona de 4", () => {
    expect(computeGroupSizes(10)).toEqual([4, 3, 3]);
  });

  it("computeGroupSizes convierte resto 2 en dos zonas de 4", () => {
    expect(computeGroupSizes(8)).toEqual([4, 4]);
  });

  it("buildProjectedQualifiedTeams arma placeholders y totalPairs", () => {
    const { qualified, placeholderMap, totalPairs } = buildProjectedQualifiedTeams([4, 3]);
    expect(totalPairs).toBe(7);
    expect(qualified).toHaveLength(5);
    expect(placeholderMap.get(1001)).toBe("1A");
    expect(placeholderMap.get(2002)).toBe("2B");
  });
});
