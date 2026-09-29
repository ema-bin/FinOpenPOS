import { describe, expect, it } from "vitest";
import {
  expandRangesToSlots,
  filterNewSlots,
  tournamentGroupSlotKey,
} from "@/lib/expand-tournament-group-slots";

describe("expand-tournament-group-slots (lib)", () => {
  it("expandRangesToSlots divide un rango según duración", () => {
    const slots = expandRangesToSlots(
      [{ slot_date: "2026-06-01", start_time: "09:00", end_time: "11:00" }],
      60
    );
    expect(slots).toEqual([
      { slot_date: "2026-06-01", start_time: "09:00", end_time: "10:00" },
      { slot_date: "2026-06-01", start_time: "10:00", end_time: "11:00" },
    ]);
  });

  it("filterNewSlots omite duplicados y existentes", () => {
    const existing = [{ slot_date: "2026-06-01", start_time: "09:00", end_time: "10:00" }];
    const candidate = [
      ...existing,
      { slot_date: "2026-06-01", start_time: "10:00", end_time: "11:00" },
      { slot_date: "2026-06-01", start_time: "10:00", end_time: "11:00" },
    ];
    const fresh = filterNewSlots(candidate, existing);
    expect(fresh).toHaveLength(1);
    expect(tournamentGroupSlotKey(fresh[0])).toBe("2026-06-01|10:00|11:00");
  });
});
