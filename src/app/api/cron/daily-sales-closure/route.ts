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
    const { closure, replaced } = await runDailySalesClosure(supabase, {
      businessDate,
      actorUserUid: getDailySalesClosureCronActorUid(),
    });

    console.info(
      `[cron/daily-sales-closure] ${businessDate} ${replaced ? "corrected" : "created"} ` +
        `total=${closure.total_sales}`
    );

    return NextResponse.json({
      ok: true,
      businessDate,
      replaced,
      revisionCount: closure.revision_count,
      totalSales: closure.total_sales,
    });
  } catch (err) {
    console.error("GET /api/cron/daily-sales-closure error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
