export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { loadActorClubSchedule } from "@/lib/clubs/load-club";
import {
  readFixedBooking,
  reservationHttpError,
  reservationsClosed,
} from "@/lib/court-reservation-http";
import { assertRequestModule } from "@/lib/clubs/modules";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  await assertRequestModule();
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "No se encontró el turno fijo" }, { status: 400 });
    }
    const parsed = readFixedBooking(await request.json(), id, await loadActorClubSchedule());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const repos = await createRepositories();
    await repos.courtReservations.saveFixedBooking(parsed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return reservationHttpError(error, "No se pudo guardar el turno fijo");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await assertRequestModule();
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "No se encontró el turno fijo" }, { status: 400 });
    }
    const repos = await createRepositories();
    await repos.courtReservations.deactivateFixedBooking(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return reservationHttpError(error, "No se pudo desactivar el turno fijo");
  }
}
