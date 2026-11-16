export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { previousBusinessDate, zonedParts } from "@/lib/clubs/schedule";
import { businessClockOf, loadClubSchedule } from "@/lib/clubs/load-club";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getDailySalesClosureCronActorUid,
  isAuthorizedCronRequest,
  runDailySalesClosure,
} from "@/lib/run-daily-sales-closure";

/**
 * Cada hora. Cada club cierra en su hora y su zona, si Ventas y el cierre automático están activos.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const now = new Date();
    const { data: clubs, error } = await supabase.from("clubs").select("id").eq("is_active", true).order("id");
    if (error) throw new Error(error.message);

    const results = [];
    for (const row of clubs ?? []) {
      const club = await loadClubSchedule(supabase, row.id);
      const local = zonedParts(now, club.timezone);
      if (!club.moduleBuffet || !club.autoDailyClosure) {
        results.push({ clubId: club.id, skipped: "module" });
        continue;
      }
      if (local.hour !== club.dailyClosureHour) {
        results.push({ clubId: club.id, skipped: "hour" });
        continue;
      }
      const businessDate = previousBusinessDate(now, businessClockOf(club));
      const { closure, replaced } = await runDailySalesClosure(supabase, {
        businessDate,
        actorUserUid: getDailySalesClosureCronActorUid(),
        clubId: club.id,
        clock: businessClockOf(club),
      });
      results.push({
        clubId: club.id,
        businessDate,
        replaced,
        revisionCount: closure.revision_count,
        totalSales: closure.total_sales,
      });
    }

    console.info(`[cron/daily-sales-closure] clubs=${results.length}`);

    return NextResponse.json({
      ok: true,
      clubs: results,
    });
  } catch (err) {
    console.error("GET /api/cron/daily-sales-closure error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
