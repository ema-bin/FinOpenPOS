export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { SETTLEMENT_REQUEST_HOUR, zonedParts } from "@/lib/clubs/schedule";
import { loadClubSchedule } from "@/lib/clubs/load-club";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCronRequest } from "@/lib/run-daily-sales-closure";
import { requestClubSettlementReports } from "@/lib/finance/request-settlements";

/**
 * Una vez por día, 06:00 UTC (03:00 en Argentina).
 * Pide a Mercado Pago el reporte del día anterior y del día en curso.
 * La bajada del archivo corre a las 06:00.
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
      if (local.hour !== SETTLEMENT_REQUEST_HOUR) {
        results.push({ clubId: club.id, skipped: "hour" });
        continue;
      }
      try {
        const reports = await requestClubSettlementReports(supabase, club.id, club.timezone, now);
        results.push({ clubId: club.id, reports });
      } catch (requestError) {
        results.push({
          clubId: club.id,
          error: requestError instanceof Error ? requestError.message : "No se pudo pedir el reporte.",
        });
      }
    }

    console.info(`[cron/settlement-report] clubs=${results.length}`);
    return NextResponse.json({ ok: true, clubs: results });
  } catch (error) {
    console.error("GET /api/cron/settlement-report error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
