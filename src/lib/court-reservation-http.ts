import { NextResponse } from "next/server";
import { ReservationError } from "@/lib/court-reservation-rpc";
import { isIsoDate } from "@/lib/class-time";
import { buildCourtSlotGrid } from "@/lib/clubs/schedule";
import { loadActorClubSchedule, type ClubSchedule } from "@/lib/clubs/load-club";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { isFixedBookingWeekday, isStandardCourtSlot, STANDARD_COURT_SLOTS } from "@/lib/court-reservation-rules";
import type { FixedBookingInput } from "@/repositories/court-reservations.repository";

export function reservationsDisabled() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function reservationsClosed(): Promise<NextResponse | null> {
  if (!isCourtReservationsEnabledServer()) return reservationsDisabled();
  try {
    const club = await loadActorClubSchedule();
    if (!club.moduleReservations) return reservationsDisabled();
    return null;
  } catch {
    return reservationsDisabled();
  }
}

export function reservationHttpError(error: unknown, fallback: string) {
  if (error instanceof ReservationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof Error && error.message.startsWith("Falta aplicar")) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

export function readFixedBooking(
  body: Record<string, unknown>,
  id: number | null,
  club?: Pick<ClubSchedule, "fixedWeekdays" | "openTime" | "closeTime" | "durationMinutes" | "overnight">
): FixedBookingInput | { error: string } {
  const weekdays = club?.fixedWeekdays ?? [1, 2, 3, 4, 5];
  const grid = club
    ? buildCourtSlotGrid({
        openTime: club.openTime,
        closeTime: club.closeTime,
        durationMinutes: club.durationMinutes,
        overnight: club.overnight,
      })
    : STANDARD_COURT_SLOTS;
  const playerId = Number(body.player_id);
  const courtId = Number(body.court_id);
  const weekday = Number(body.weekday);
  const start = String(body.start_time ?? "").slice(0, 5);
  const end = String(body.end_time ?? "").slice(0, 5);
  const validFrom = String(body.valid_from ?? "");
  const validUntil = body.valid_until == null || body.valid_until === "" ? null : String(body.valid_until);
  const suspendedFrom =
    body.suspended_from == null || body.suspended_from === "" ? null : String(body.suspended_from);
  const suspendedUntil =
    body.suspended_until == null || body.suspended_until === "" ? null : String(body.suspended_until);
  if (!Number.isInteger(playerId) || playerId <= 0) return { error: "Elegí un jugador" };
  if (!Number.isInteger(courtId) || courtId <= 0) return { error: "Elegí una cancha" };
  if (!Number.isInteger(weekday) || !isFixedBookingWeekday(weekday, weekdays)) {
    return { error: "Ese día no está habilitado para turnos fijos" };
  }
  if (!isStandardCourtSlot(start, end, grid)) return { error: "El horario tiene que coincidir con un turno de la grilla" };
  if (!isIsoDate(validFrom)) return { error: "La vigencia no es válida" };
  if (validUntil && !isIsoDate(validUntil)) return { error: "La vigencia no es válida" };
  if ((suspendedFrom == null) !== (suspendedUntil == null)) {
    return { error: "La suspensión tiene que tener desde y hasta" };
  }
  if (suspendedFrom && (!isIsoDate(suspendedFrom) || !suspendedUntil || !isIsoDate(suspendedUntil))) {
    return { error: "La suspensión no es válida" };
  }
  return {
    id,
    playerId,
    courtId,
    weekday,
    startTime: start,
    endTime: end,
    validFrom,
    validUntil,
    isActive: body.is_active !== false,
    suspendedFrom,
    suspendedUntil,
  };
}
