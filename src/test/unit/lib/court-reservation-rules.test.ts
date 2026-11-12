import { describe, expect, it } from "vitest";
import { weekdayOf } from "@/lib/class-time";
import {
  fixedBookingApplyDecision,
  isStandardCourtSlot,
  nextMonday,
  STANDARD_COURT_SLOTS,
  weekDatesFromMonday,
} from "@/lib/court-reservation-rules";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";

describe("turnos estándar", () => {
  it("coincide con la grilla de 90 minutos y el cierre de las 01:00", () => {
    expect(STANDARD_COURT_SLOTS).toHaveLength(10);
    expect(STANDARD_COURT_SLOTS[0]).toEqual({ start: "10:00", end: "11:30" });
    expect(STANDARD_COURT_SLOTS.at(-1)).toEqual({ start: "23:30", end: "01:00" });
    expect(isStandardCourtSlot("23:30:00", "01:00:00")).toBe(true);
    expect(isStandardCourtSlot("10:15", "11:45")).toBe(false);
  });
});

describe("semana siguiente", () => {
  it("el sábado 14 de noviembre de 2026 genera del lunes 16 al domingo 22", () => {
    const monday = nextMonday("2026-11-14");
    expect(monday).toBe("2026-11-16");
    expect(weekdayOf(monday)).toBe(1);
    const week = weekDatesFromMonday(monday);
    expect(week[0]).toBe("2026-11-16");
    expect(week[6]).toBe("2026-11-22");
  });

  it("un lunes pide el lunes siguiente", () => {
    expect(nextMonday("2026-11-16")).toBe("2026-11-23");
  });
});

describe("aplicar un turno fijo", () => {
  const free = {
    reservationStatus: "free" as const,
    source: null,
    fixedBookingId: null,
    detached: false,
    wasPlayed: false,
    hasCourtRecord: false,
    blocked: false,
  };

  it("reserva un turno libre", () => {
    expect(fixedBookingApplyDecision(free, 4)).toBe("apply");
  });

  it("no pisa una reserva manual, un turno jugado ni un horario bloqueado", () => {
    expect(fixedBookingApplyDecision({ ...free, reservationStatus: "reserved", source: "manual" }, 4)).toBe(
      "skip"
    );
    expect(fixedBookingApplyDecision({ ...free, wasPlayed: true }, 4)).toBe("skip");
    expect(fixedBookingApplyDecision({ ...free, hasCourtRecord: true }, 4)).toBe("skip");
    expect(fixedBookingApplyDecision({ ...free, blocked: true }, 4)).toBe("skip");
    expect(fixedBookingApplyDecision({ ...free, detached: true }, 4)).toBe("skip");
  });

  it("si ya es de ese fijo, solo puede actualizar el jugador", () => {
    expect(
      fixedBookingApplyDecision(
        {
          ...free,
          reservationStatus: "reserved",
          source: "fixed",
          fixedBookingId: 4,
        },
        4
      )
    ).toBe("refresh-player");
  });
});

describe("feature flag", () => {
  it("queda apagado si falta alguna de las dos variables", () => {
    const previousServer = process.env.ENABLE_COURT_RESERVATIONS;
    const previousClient = process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS;
    delete process.env.ENABLE_COURT_RESERVATIONS;
    delete process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS;
    expect(isCourtReservationsEnabledServer()).toBe(false);
    process.env.ENABLE_COURT_RESERVATIONS = "true";
    expect(isCourtReservationsEnabledServer()).toBe(false);
    process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS = "true";
    expect(isCourtReservationsEnabledServer()).toBe(true);
    if (previousServer === undefined) delete process.env.ENABLE_COURT_RESERVATIONS;
    else process.env.ENABLE_COURT_RESERVATIONS = previousServer;
    if (previousClient === undefined) delete process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS;
    else process.env.NEXT_PUBLIC_ENABLE_COURT_RESERVATIONS = previousClient;
  });
});
