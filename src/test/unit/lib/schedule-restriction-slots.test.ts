import { describe, expect, it } from "vitest";
import { cannotPlayAnySlot, slotIdsAtDateTime } from "@/lib/schedule-restriction-slots";

const slots = [
  { id: 11, slot_date: "2026-11-14", start_time: "10:00:00" },
  { id: 21, slot_date: "2026-11-14", start_time: "10:00" },
  { id: 31, slot_date: "2026-11-14", start_time: "10:00:00" },
  { id: 12, slot_date: "2026-11-14", start_time: "12:00:00" },
];

describe("restricciones en la revisión conjunta", () => {
  it("junta los slots de todos los torneos que caen en el mismo horario", () => {
    expect(slotIdsAtDateTime(slots, "2026-11-14", "10:00:00")).toEqual([11, 21, 31]);
    expect(slotIdsAtDateTime(slots, "2026-11-14", "12:00")).toEqual([12]);
  });

  it("marca a la pareja si el slot de su torneo está restringido, aunque no sea el primero", () => {
    expect(cannotPlayAnySlot([31], slotIdsAtDateTime(slots, "2026-11-14", "10:00"))).toBe(true);
    expect(cannotPlayAnySlot([11], slotIdsAtDateTime(slots, "2026-11-14", "10:00"))).toBe(true);
    expect(cannotPlayAnySlot([99], slotIdsAtDateTime(slots, "2026-11-14", "10:00"))).toBe(false);
    expect(cannotPlayAnySlot([], slotIdsAtDateTime(slots, "2026-11-14", "10:00"))).toBe(false);
  });
});
