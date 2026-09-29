import { describe, expect, it } from "vitest";
import {
  buildBlockedCourtsFromPhysicalSelections,
  mergeBlockedCourtsByTournamentSlot,
  parseTournamentPhysicalSlotSelections,
} from "@/lib/tournament-schedule-stream-payload";

describe("tournament-schedule-stream-payload (lib)", () => {
  it("parseTournamentPhysicalSlotSelections ignora filas inválidas", () => {
    expect(
      parseTournamentPhysicalSlotSelections({
        selectedPhysicalSlots: [
          { tournamentGroupSlotId: 5, courtId: 2 },
          { tournamentGroupSlotId: 0, courtId: 1 },
          { slotId: 7, courtId: 3 },
        ],
      })
    ).toEqual([
      { tournamentGroupSlotId: 5, courtId: 2 },
      { tournamentGroupSlotId: 7, courtId: 3 },
    ]);
  });

  it("buildBlockedCourtsFromPhysicalSelections bloquea canchas no seleccionadas", () => {
    const blocked = buildBlockedCourtsFromPhysicalSelections(
      [1, 2],
      [100],
      [{ tournamentGroupSlotId: 100, courtId: 1 }]
    );
    expect(blocked.get(100)?.has(2)).toBe(true);
    expect(blocked.get(100)?.has(1)).toBe(false);
  });

  it("mergeBlockedCourtsByTournamentSlot une mapas", () => {
    const a = new Map([[1, new Set([2])]]);
    const b = new Map([[1, new Set([3])]]);
    const merged = mergeBlockedCourtsByTournamentSlot(a, b);
    expect(merged?.get(1)).toEqual(new Set([2, 3]));
  });
});
