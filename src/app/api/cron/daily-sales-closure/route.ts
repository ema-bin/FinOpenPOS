export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { DAILY_JOB_HOUR, previousBusinessDate, zonedParts } from "@/lib/clubs/schedule";
import { businessClockOf, loadClubSchedule } from "@/lib/clubs/load-club";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getDailySalesClosureCronActorUid,
  isAuthorizedCronRequest,
  runDailySalesClosure,
} from "@/lib/run-daily-sales-closure";
import { importClubSettlements } from "@/lib/finance/import-settlements";

/**
 * Una vez por día, 09:00 UTC (06:00 en Argentina).
 * Baja las liquidaciones de Mercado Pago que falten.
 * Cada club cierra la caja si Ventas está activo.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const now = new Date();
    const actor = getDailySalesClosureCronActorUid();
    const { data: clubs, error } = await supabase.from("clubs").select("id").eq("is_active", true).order("id");
    if (error) throw new Error(error.message);

    const results = [];
    for (const row of clubs ?? []) {
      const club = await loadClubSchedule(supabase, row.id);
      const local = zonedParts(now, club.timezone);
      let settlements: Awaited<ReturnType<typeof importClubSettlements>> = [];
      if (local.hour === DAILY_JOB_HOUR) {
        try {
          settlements = await importClubSettlements(supabase, club.id, actor);
        } catch (importError) {
          settlements = [{
            paymentMethodId: 0,
            importedFiles: 0,
            insertedRows: 0,
            skippedRows: 0,
            skippedFiles: 0,
            error: importError instanceof Error ? importError.message : "No se pudieron traer las liquidaciones.",
          }];
        }
      }
      if (!club.moduleBuffet || !club.autoDailyClosure) {
        results.push({ clubId: club.id, skipped: "module", settlements });
        continue;
      }
      if (local.hour !== DAILY_JOB_HOUR) {
        results.push({ clubId: club.id, skipped: "hour", settlements });
        continue;
      }
      const businessDate = previousBusinessDate(now, businessClockOf(club));
      const { closure, replaced } = await runDailySalesClosure(supabase, {
        businessDate,
        actorUserUid: actor,
        clubId: club.id,
        clock: businessClockOf(club),
      });
      results.push({
        clubId: club.id,
        businessDate,
        replaced,
        revisionCount: closure.revision_count,
        totalSales: closure.total_sales,
        settlements,
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
