export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import {
  readFixedBooking,
  reservationHttpError,
  reservationsDisabled,
} from "@/lib/court-reservation-http";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isCourtReservationsEnabledServer()) return reservationsDisabled();
  try {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "No se encontró el turno fijo" }, { status: 400 });
    }
    const parsed = readFixedBooking(await request.json(), id);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const repos = await createRepositories();
    await repos.courtReservations.saveFixedBooking(parsed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return reservationHttpError(error, "No se pudo guardar el turno fijo");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!isCourtReservationsEnabledServer()) return reservationsDisabled();
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
