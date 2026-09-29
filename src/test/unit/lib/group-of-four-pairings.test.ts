import { describe, expect, it } from "vitest";
import {
  detectGroupOfFourPairingPreset,
  pairingFromMatch1Teams,
  pairingFromPreset,
} from "@/lib/group-of-four-pairings";

describe("group-of-four-pairings (lib)", () => {
  const ordered: [number, number, number, number] = [10, 20, 30, 40];

  it("pairingFromPreset aplica cruces 1-4 / 2-3", () => {
    expect(pairingFromPreset(ordered, "1-4_2-3")).toEqual({
      match1: [10, 40],
      match2: [20, 30],
    });
  });

  it("detectGroupOfFourPairingPreset reconoce preset activo", () => {
    const preset = detectGroupOfFourPairingPreset(
      ordered,
      [10, 40],
      [20, 30]
    );
    expect(preset).toBe("1-4_2-3");
  });

  it("pairingFromMatch1Teams completa segunda ronda", () => {
    expect(pairingFromMatch1Teams([10, 20, 30, 40], 10, 20)).toEqual({
      match1: [10, 20],
      match2: [30, 40],
    });
    expect(pairingFromMatch1Teams([10, 20, 30, 40], 10, 10)).toBeNull();
  });
});
