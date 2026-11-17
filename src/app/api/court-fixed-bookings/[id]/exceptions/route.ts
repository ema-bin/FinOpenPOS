export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isIsoDate } from "@/lib/class-time";
import { reservationHttpError, reservationsClosed } from "@/lib/court-reservation-http";
import { assertRequestModule } from "@/lib/clubs/modules";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  await assertRequestModule();
  const closed = await reservationsClosed();
  if (closed) return closed;
  try {
    const id = Number(params.id);
    const date = String((await request.json()).date ?? "");
    if (!Number.isInteger(id) || id <= 0 || !isIsoDate(date)) {
      return NextResponse.json({ error: "Elegí la fecha a cancelar" }, { status: 400 });
    }
    const repos = await createRepositories();
    await repos.courtReservations.cancelFixedDate(id, date);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return reservationHttpError(error, "No se pudo cancelar esa fecha");
  }
}
