export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { reservationsClosed } from "@/lib/court-reservation-http";
import { ReservationError } from "@/lib/court-reservation-rpc";
import { blocksForCourtSlot, classesTouchingSlot } from "@/lib/class-occupancy";
import { isIsoDate } from "@/lib/class-time";
import { assertRequestModule } from "@/lib/clubs/modules";

function httpError(error: unknown, fallback: string) {
  if (error instanceof ReservationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof Error && error.message.startsWith("Falta aplicar")) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  console.error(error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  await assertRequestModule();
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isIsoDate(date)) {
      return NextResponse.json({ error: "La fecha no es válida" }, { status: 400 });
    }
    const repos = await createRepositories();
    const [slots, classOccupancy, tournamentOccupancy] = await Promise.all([
      repos.courtReservations.listDay(date),
      repos.classes.listOccupancy(date, { includeCancelled: true }),
      repos.tournamentMatches.listCourtOccupancy(date),
    ]);
    const scheduledClasses = classOccupancy.filter((session) => session.status === "scheduled");
    return NextResponse.json(
      slots.map((slot) => ({
        ...slot,
        ...blocksForCourtSlot(slot, scheduledClasses, tournamentOccupancy),
        class_sessions: classesTouchingSlot(slot, classOccupancy),
      }))
    );
  } catch (error) {
    return httpError(error, "No se pudieron cargar las reservas");
  }
}

export async function POST(request: Request) {
  await assertRequestModule();
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const body = await request.json();
    const slotId = Number(body.slot_id);
    const playerId = Number(body.player_id);
    if (!Number.isInteger(slotId) || slotId <= 0 || !Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Elegí el turno y el jugador" }, { status: 400 });
    }
    const repos = await createRepositories();
    await repos.courtReservations.reserve(slotId, playerId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return httpError(error, "No se pudo reservar");
  }
}
