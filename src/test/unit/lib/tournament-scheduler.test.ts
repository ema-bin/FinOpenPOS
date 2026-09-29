import { describe, expect, it } from "vitest";
import {
  calculateEndTime,
  generateTimeSlots,
  slotViolatesRestriction,
  timeToMinutesOfDay,
} from "@/lib/tournament-scheduler";

describe("tournament-scheduler (lib)", () => {
  it("timeToMinutesOfDay interpreta 00:00 como fin de día", () => {
    expect(timeToMinutesOfDay("00:00")).toBe(24 * 60);
    expect(timeToMinutesOfDay("10:30")).toBe(630);
  });

  it("calculateEndTime suma duración", () => {
    expect(calculateEndTime("10:00", 90)).toBe("11:30");
  });

  it("generateTimeSlots respeta duración y canchas", () => {
    const slots = generateTimeSlots(
      [{ date: "2026-06-01", startTime: "10:00", endTime: "12:00" }],
      60,
      2
    );
    expect(slots).toHaveLength(4);
    expect(slots[0].startTime).toBe("10:00");
  });

  it("slotViolatesRestriction detecta solapamiento", () => {
    const slot = {
      date: "2026-06-01",
      startTime: "10:00",
      endTime: "11:00",
    };
    expect(
      slotViolatesRestriction(slot, [
        { date: "2026-06-01", start_time: "10:30", end_time: "12:00" },
      ])
    ).toBe(true);
    expect(
      slotViolatesRestriction(slot, [
        { date: "2026-06-01", start_time: "11:00", end_time: "12:00" },
      ])
    ).toBe(false);
  });
});
