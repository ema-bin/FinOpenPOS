export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { reservationsClosed } from "@/lib/court-reservation-http";
import { ReservationError } from "@/lib/court-reservation-rpc";

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
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const slotId = Number(params.id);
    const playerId = Number((await request.json()).player_id);
    if (!Number.isInteger(slotId) || slotId <= 0 || !Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Elegí un jugador" }, { status: 400 });
    }
    const repos = await createRepositories();
    await repos.courtReservations.setPlayer(slotId, playerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return httpError(error, "No se pudo cambiar el jugador");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const slotId = Number(params.id);
    if (!Number.isInteger(slotId) || slotId <= 0) {
      return NextResponse.json({ error: "No se encontró el turno" }, { status: 400 });
    }
    const repos = await createRepositories();
    await repos.courtReservations.cancel(slotId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return httpError(error, "No se pudo cancelar la reserva");
  }
}
