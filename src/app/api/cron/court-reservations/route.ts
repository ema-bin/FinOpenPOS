export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, getDailySalesClosureCronActorUid } from "@/lib/run-daily-sales-closure";
import { createServiceClient } from "@/lib/supabase/service";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { nextMonday, todayInBuenosAires } from "@/lib/court-reservation-rules";
import { generateReservationWeek } from "@/lib/generate-reservation-week";
import { CourtSlotsRepository } from "@/repositories/court-slots.repository";
import { CourtReservationsRepository } from "@/repositories/court-reservations.repository";
import { CourtsRepository } from "@/repositories/courts.repository";

/** Sábados 06:00 UTC = 03:00 en Argentina. Con el flag apagado no escribe nada. */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isCourtReservationsEnabledServer()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const monday = nextMonday(todayInBuenosAires());
    const supabase = createServiceClient();
    const actor = getDailySalesClosureCronActorUid();
    const courts = await new CourtsRepository(supabase, actor).findAll(true);
    const result = await generateReservationWeek({
      slots: new CourtSlotsRepository(supabase, actor),
      reservations: new CourtReservationsRepository(supabase, actor),
      courtIds: courts.map((court) => court.id),
      monday,
    });
    console.info(`[cron/court-reservations] ${result.weekStart}..${result.weekEnd}`);
    return NextResponse.json({ ok: true, skipped: false, ...result });
  } catch (error) {
    console.error("GET /api/cron/court-reservations error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
