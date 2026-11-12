export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { ReservationError } from "@/lib/court-reservation-rpc";
import { blocksForCourtSlot } from "@/lib/class-occupancy";
import { isIsoDate } from "@/lib/class-time";

function disabled() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

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
  if (!isCourtReservationsEnabledServer()) return disabled();
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isIsoDate(date)) {
      return NextResponse.json({ error: "La fecha no es válida" }, { status: 400 });
    }
    const repos = await createRepositories();
    const [slots, classOccupancy, tournamentOccupancy] = await Promise.all([
      repos.courtReservations.listDay(date),
      repos.classes.listOccupancy(date),
      repos.tournamentMatches.listCourtOccupancy(date),
    ]);
    return NextResponse.json(
      slots.map((slot) => ({
        ...slot,
        ...blocksForCourtSlot(slot, classOccupancy, tournamentOccupancy),
      }))
    );
  } catch (error) {
    return httpError(error, "No se pudieron cargar las reservas");
  }
}

export async function POST(request: Request) {
  if (!isCourtReservationsEnabledServer()) return disabled();
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
