import { describe, expect, it } from "vitest";
import { STANDARD_COURT_SLOTS } from "@/lib/court-reservation-rules";
import { getBusinessDayRange, getCurrentBusinessDate, getPreviousBusinessDate } from "@/lib/business-day";
import {
  buildCourtSlotGrid,
  businessDayRange,
  currentBusinessDate,
  DEFAULT_BUSINESS_CLOCK,
  previousBusinessDate,
  zonedParts,
} from "@/lib/clubs/schedule";

const currentGrid = {
  openTime: "10:00",
  closeTime: "01:00",
  durationMinutes: 90,
  overnight: true,
};

describe("grilla del complejo", () => {
  it("con el horario de este club coincide con los turnos de hoy", () => {
    expect(buildCourtSlotGrid(currentGrid)).toEqual(STANDARD_COURT_SLOTS);
  });

  it("abrir más temprano cambia el primer turno", () => {
    const grid = buildCourtSlotGrid({ ...currentGrid, openTime: "09:00" });
    expect(grid[0]).toEqual({ start: "09:00", end: "10:30" });
    expect(grid.at(-1)).toEqual({ start: "22:30", end: "00:00" });
  });

  it("sin cruce de medianoche corta en el cierre", () => {
    const grid = buildCourtSlotGrid({
      openTime: "10:00",
      closeTime: "13:00",
      durationMinutes: 60,
      overnight: false,
    });
    expect(grid).toEqual([
      { start: "10:00", end: "11:00" },
      { start: "11:00", end: "12:00" },
      { start: "12:00", end: "13:00" },
    ]);
  });
});

describe("día de negocio del complejo", () => {
  it("a las 03:00 de Buenos Aires es el mismo día que el cálculo de las 06:00 UTC", () => {
    const atClosure = new Date("2026-11-16T06:00:00.000Z");
    const before = new Date("2026-11-16T05:59:00.000Z");
    expect(currentBusinessDate(atClosure)).toBe(getCurrentBusinessDate(atClosure));
    expect(previousBusinessDate(atClosure)).toBe(getPreviousBusinessDate(atClosure));
    expect(currentBusinessDate(before)).toBe(getCurrentBusinessDate(before));
    const range = businessDayRange("2026-11-15");
    const historic = getBusinessDayRange("2026-11-15");
    expect(range.start.toISOString()).toBe(historic.start.toISOString());
    expect(range.end.toISOString()).toBe(historic.end.toISOString());
  });

  it("el cron de reservas de este club cae el sábado a las 03:00", () => {
    const saturday = new Date("2026-11-14T06:00:00.000Z");
    const local = zonedParts(saturday, DEFAULT_BUSINESS_CLOCK.timeZone);
    expect(local.date).toBe("2026-11-14");
    expect(local.hour).toBe(3);
    expect(local.weekday).toBe(6);
  });
});
