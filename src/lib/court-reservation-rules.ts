import { addDaysIso, isIsoDate, weekdayOf } from "@/lib/class-time";

/** Misma grilla que Generar turnos del día: 10:00 a 23:30 cada 90 minutos, más 23:30–01:00. */
export const STANDARD_COURT_SLOTS: ReadonlyArray<{ start: string; end: string }> = [
  { start: "10:00", end: "11:30" },
  { start: "11:30", end: "13:00" },
  { start: "13:00", end: "14:30" },
  { start: "14:30", end: "16:00" },
  { start: "16:00", end: "17:30" },
  { start: "17:30", end: "19:00" },
  { start: "19:00", end: "20:30" },
  { start: "20:30", end: "22:00" },
  { start: "22:00", end: "23:30" },
  { start: "23:30", end: "01:00" },
];

export function isStandardCourtSlot(start: string, end: string): boolean {
  const startKey = start.slice(0, 5);
  const endKey = end.slice(0, 5);
  return STANDARD_COURT_SLOTS.some((slot) => slot.start === startKey && slot.end === endKey);
}

export function todayInBuenosAires(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** El lunes siguiente. Si hoy ya es lunes, el de la semana que viene. */
export function nextMonday(isoDate: string): string {
  if (!isIsoDate(isoDate)) throw new Error("La fecha no es válida");
  const weekday = weekdayOf(isoDate);
  const delta = weekday === 1 ? 7 : (8 - weekday) % 7;
  return addDaysIso(isoDate, delta);
}

export function weekDatesFromMonday(monday: string): string[] {
  if (!isIsoDate(monday) || weekdayOf(monday) !== 1) {
    throw new Error("La semana tiene que empezar un lunes");
  }
  return Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index));
}

export type FixedApplyState = {
  reservationStatus: "free" | "reserved";
  source: "manual" | "fixed" | null;
  fixedBookingId: number | null;
  detached: boolean;
  wasPlayed: boolean;
  hasCourtRecord: boolean;
  blocked: boolean;
};

export type FixedApplyDecision = "apply" | "refresh-player" | "keep" | "skip";

/**
 * Qué hace la generación con un turno que ya existe.
 * apply escribe la reserva del fijo. refresh-player solo cambia el jugador.
 * keep no toca nada porque ya está aplicado. skip deja el turno como está.
 */
export function fixedBookingApplyDecision(
  state: FixedApplyState,
  bookingId: number
): FixedApplyDecision {
  if (state.blocked || state.wasPlayed || state.hasCourtRecord) return "skip";
  if (state.detached || (state.reservationStatus === "reserved" && state.source === "manual")) {
    return "skip";
  }
  if (state.reservationStatus === "reserved" && state.fixedBookingId !== bookingId) return "skip";
  if (
    state.reservationStatus === "reserved" &&
    state.source === "fixed" &&
    state.fixedBookingId === bookingId
  ) {
    return "refresh-player";
  }
  if (state.reservationStatus === "free") return "apply";
  return "skip";
}
