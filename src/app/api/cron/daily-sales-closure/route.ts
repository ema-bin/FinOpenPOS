export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getPreviousBusinessDate } from "@/lib/business-day";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getDailySalesClosureCronActorUid,
  isAuthorizedCronRequest,
  runDailySalesClosure,
} from "@/lib/run-daily-sales-closure";

/**
 * Cierre automático diario (Vercel Cron: 06:00 UTC).
 * Cierra el día de negocio que acaba de terminar; corrige si ya existía.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const businessDate = getPreviousBusinessDate();
    const supabase = createServiceClient();
    const { data: clubs, error } = await supabase.from("clubs").select("id").eq("is_active", true).order("id");
    if (error) throw new Error(error.message);

    const results = [];
    for (const club of clubs ?? []) {
      const { closure, replaced } = await runDailySalesClosure(supabase, {
        businessDate,
        actorUserUid: getDailySalesClosureCronActorUid(),
        clubId: club.id,
      });
      results.push({
        clubId: club.id,
        replaced,
        revisionCount: closure.revision_count,
        totalSales: closure.total_sales,
      });
    }

    console.info(`[cron/daily-sales-closure] ${businessDate} clubs=${results.length}`);

    return NextResponse.json({
      ok: true,
      businessDate,
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
