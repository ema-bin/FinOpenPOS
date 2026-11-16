export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { loadActorClubSchedule } from "@/lib/clubs/load-club";
import { readFixedBooking, reservationHttpError, reservationsClosed } from "@/lib/court-reservation-http";

export async function GET() {
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const repos = await createRepositories();
    return NextResponse.json(await repos.courtReservations.listFixedBookings());
  } catch (error) {
    return reservationHttpError(error, "No se pudieron cargar los turnos fijos");
  }
}

export async function POST(request: Request) {
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const club = await loadActorClubSchedule();
    const parsed = readFixedBooking(await request.json(), null, club);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const repos = await createRepositories();
    const id = await repos.courtReservations.saveFixedBooking(parsed);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return reservationHttpError(error, "No se pudo guardar el turno fijo");
  }
}
