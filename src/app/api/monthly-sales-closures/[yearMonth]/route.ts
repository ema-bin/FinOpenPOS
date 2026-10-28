export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseYearMonth } from "@/lib/month-period";
import { listCompletedPurchasesInMonth, sumPurchases } from "@/lib/month-purchases";
import { MonthlySalesClosuresRepository } from "@/repositories/monthly-sales-closures.repository";

type RouteContext = { params: { yearMonth: string } };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const yearMonth = parseYearMonth(params.yearMonth);
    if (!yearMonth) {
      return NextResponse.json({ error: "Mes inválido (use YYYY-MM)" }, { status: 400 });
    }

    const repo = new MonthlySalesClosuresRepository(supabase);
    const closure = await repo.findWithDetails(yearMonth);
    if (!closure) {
      return NextResponse.json({ error: "Cierre mensual no encontrado" }, { status: 404 });
    }

    const purchases = await listCompletedPurchasesInMonth(supabase, yearMonth);
    return NextResponse.json({
      ...closure,
      purchases,
      total_purchases: sumPurchases(purchases),
    });
  } catch (err) {
    console.error("GET /monthly-sales-closures/[yearMonth] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
