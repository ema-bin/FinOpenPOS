export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { generateReservationWeek } from "@/lib/generate-reservation-week";
import { ReservationError } from "@/lib/court-reservation-rpc";
import { isIsoDate, weekdayOf } from "@/lib/class-time";

export async function POST(request: Request) {
  if (!isCourtReservationsEnabledServer()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const monday = String((await request.json()).monday ?? "");
    if (!isIsoDate(monday) || weekdayOf(monday) !== 1) {
      return NextResponse.json({ error: "La semana tiene que empezar un lunes" }, { status: 400 });
    }
    const repos = await createRepositories();
    const courts = await repos.courts.findAll(true);
    const result = await generateReservationWeek({
      slots: repos.courtSlots,
      reservations: repos.courtReservations,
      courtIds: courts.map((court) => court.id),
      monday,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReservationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Falta aplicar")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("POST /court-reservations/generate-week error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar la semana" },
      { status: 500 }
    );
  }
}
