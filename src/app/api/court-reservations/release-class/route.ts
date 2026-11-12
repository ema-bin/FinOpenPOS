export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { ClassRequestError } from "@/lib/class-request-error";
import { setClassOnSlot } from "@/lib/court-class-slot";

/** Cancela una clase de ese horario. Las otras clases del día quedan. */
export async function POST(request: Request) {
  if (!isCourtReservationsEnabledServer()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = await request.json();
    const slotId = Number(body.slot_id);
    const sessionId = Number(body.session_id);
    if (!Number.isInteger(slotId) || slotId <= 0 || !Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "Elegí la clase" }, { status: 400 });
    }
    const repos = await createRepositories();
    await setClassOnSlot(repos, slotId, sessionId, "cancel");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ClassRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /court-reservations/release-class error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cancelar la clase" },
      { status: 500 }
    );
  }
}
