import { describe, expect, it } from "vitest";
import {
  buildPlayoffScheduleSlots,
  parseExplicitPlayoffSlots,
  parsePlayoffScheduleSelections,
  parseScheduleConfigFromBody,
  parseTournamentSlotPlans,
  playoffSlotIntervalFromMinutes,
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

  it("parsePlayoffScheduleSelections ignora filas inválidas", () => {
    const rows = parsePlayoffScheduleSelections({
      selectedPhysicalSlots: [
        {
          slotDate: "2026-08-15",
          startTime: "10:00",
          endTime: "12:00",
          courtId: 2,
        },
        { slotDate: "bad", courtId: 1, startTime: "10:00", endTime: "11:00" },
        { slotDate: "2026-08-15", courtId: 0, startTime: "10:00", endTime: "11:00" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].courtId).toBe(2);
  });

  it("parseScheduleConfigFromBody con selectedPhysicalSlots infiere courtIds", () => {
    const config = parseScheduleConfigFromBody({
      matchDuration: 60,
      selectedPhysicalSlots: [
        {
          slotDate: "2026-08-15",
          startTime: "10:00",
          endTime: "13:00",
          courtId: 3,
        },
      ],
    });
    expect(config?.courtIds).toEqual([3]);
    expect(config?.selectedPhysicalSlots).toHaveLength(1);
  });

  it("buildPlayoffScheduleSlots expande ventanas físicas seleccionadas", () => {
    const slots = buildPlayoffScheduleSlots(
      {
        days: [],
        matchDuration: 60,
        courtIds: [1],
        selectedPhysicalSlots: [
          {
            slotDate: "2026-08-15",
            startTime: "10:00",
            endTime: "12:00",
            courtId: 1,
          },
        ],
      },
      60
    );
    expect(slots).toEqual([
      { date: "2026-08-15", startTime: "10:00", court_id: 1 },
      { date: "2026-08-15", startTime: "11:00", court_id: 1 },
    ]);
  });

  it("parseTournamentSlotPlans agrupa por id de torneo", () => {
    const map = parseTournamentSlotPlans({
      tournamentSlotPlans: {
        "42": [
          { date: "2026-08-01", startTime: "09:00", courtId: 1 },
        ],
        invalid: [{ date: "2026-08-01", startTime: "10:00", courtId: 1 }],
      },
    });
    expect(map?.size).toBe(1);
    expect(map?.get(42)).toEqual([
      { date: "2026-08-01", startTime: "09:00", court_id: 1 },
    ]);
  });

  it("playoffSlotIntervalFromMinutes aplica mínimo 15", () => {
    expect(playoffSlotIntervalFromMinutes(10)).toBe(15);
    expect(playoffSlotIntervalFromMinutes(75)).toBe(75);
  });
});
