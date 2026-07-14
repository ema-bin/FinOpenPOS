export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateMonthlySalesClosure } from "@/lib/aggregate-monthly-sales-closure";
import { getCurrentYearMonth, parseYearMonth } from "@/lib/month-period";
import { MonthlySalesClosuresRepository } from "@/repositories/monthly-sales-closures.repository";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const yearMonth = parseYearMonth(url.searchParams.get("month")) ?? getCurrentYearMonth();

    const repo = new MonthlySalesClosuresRepository(supabase);
    const preview = await aggregateMonthlySalesClosure(supabase, yearMonth);
    const existing = await repo.findWithDetails(yearMonth);

    if (existing) {
      return NextResponse.json({
        alreadyClosed: true,
        closure: existing,
        preview,
      });
    }

    return NextResponse.json({
      alreadyClosed: false,
      preview,
    });
  } catch (err) {
    console.error("GET /monthly-sales-closures/preview error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("No hay cierres diarios") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
