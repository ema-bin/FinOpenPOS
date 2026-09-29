import { describe, expect, it } from "vitest";
import {
  buildPlayoffScheduleSlots,
  parseExplicitPlayoffSlots,
  parseScheduleConfigFromBody,
} from "@/lib/playoff-schedule-slots";

describe("playoff-schedule-slots (lib)", () => {
  it("parseExplicitPlayoffSlots normaliza filas del body", () => {
    const slots = parseExplicitPlayoffSlots({
      explicitPlayoffSlots: [
        {
          date: "2026-08-15",
          startTime: "14:30:00",
          courtId: 2,
          endTime: "15:30",
        },
      ],
    });
    expect(slots).toEqual([
      {
        date: "2026-08-15",
        startTime: "14:30",
        court_id: 2,
        endTime: "15:30",
      },
    ]);
  });

  it("parseScheduleConfigFromBody con grilla legacy de días", () => {
    const config = parseScheduleConfigFromBody({
      days: [{ date: "2026-08-15", startTime: "09:00", endTime: "12:00" }],
      matchDuration: 90,
      courtIds: [1, 2],
    });
    expect(config?.days).toHaveLength(1);
    expect(config?.matchDuration).toBe(90);
    expect(config?.courtIds).toEqual([1, 2]);
  });

  it("buildPlayoffScheduleSlots genera turnos por cancha en modo legacy", () => {
    const slots = buildPlayoffScheduleSlots(
      {
        days: [{ date: "2026-08-15", startTime: "10:00", endTime: "12:00" }],
        matchDuration: 60,
        courtIds: [1, 2],
      },
      60
    );
    expect(slots).not.toBeNull();
    expect(slots!.length).toBeGreaterThanOrEqual(2);
    expect(slots!.some((s) => s.court_id === 1)).toBe(true);
    expect(slots!.some((s) => s.court_id === 2)).toBe(true);
  });
});
