export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, getDailySalesClosureCronActorUid } from "@/lib/run-daily-sales-closure";
import { createServiceClient } from "@/lib/supabase/service";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { nextMonday } from "@/lib/court-reservation-rules";
import { zonedParts } from "@/lib/clubs/schedule";
import { courtSlotConfig, loadClubSchedule } from "@/lib/clubs/load-club";
import { generateReservationWeek } from "@/lib/generate-reservation-week";
import { CourtSlotsRepository } from "@/repositories/court-slots.repository";
import { CourtReservationsRepository } from "@/repositories/court-reservations.repository";

/** Sábados 09:00 UTC (06:00 en Argentina). El flag apagado no escribe nada. Cada club entra si ese día y esa hora son los suyos. */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isCourtReservationsEnabledServer()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = createServiceClient();
    const actor = getDailySalesClosureCronActorUid();
    const now = new Date();
    const { data: clubs, error } = await supabase.from("clubs").select("id").eq("is_active", true).order("id");
    if (error) throw new Error(error.message);

    const results = [];
    for (const row of clubs ?? []) {
      const club = await loadClubSchedule(supabase, row.id);
      const local = zonedParts(now, club.timezone);
      if (!club.moduleReservations || !club.autoReservationWeek) {
        results.push({ clubId: club.id, skipped: "module" });
        continue;
      }
      if (local.weekday !== club.reservationWeekWeekday || local.hour !== club.reservationWeekHour) {
        results.push({ clubId: club.id, skipped: "hour" });
        continue;
      }
      const { data: courts, error: courtsError } = await supabase
        .from("courts")
        .select("id")
        .eq("club_id", club.id)
        .eq("is_active", true);
      if (courtsError) throw new Error(courtsError.message);
      const result = await generateReservationWeek({
        slots: new CourtSlotsRepository(supabase, actor),
        reservations: new CourtReservationsRepository(supabase, actor),
        courtIds: (courts ?? []).map((court) => court.id),
        monday: nextMonday(local.date),
        clubId: club.id,
        slotConfig: courtSlotConfig(club),
      });
      results.push({ clubId: club.id, ...result });
    }
    console.info(`[cron/court-reservations] clubs=${results.length}`);
    return NextResponse.json({ ok: true, skipped: false, clubs: results });
  } catch (error) {
    console.error("GET /api/cron/court-reservations error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
