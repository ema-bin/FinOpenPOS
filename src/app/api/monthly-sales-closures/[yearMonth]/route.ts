export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseYearMonth } from "@/lib/month-period";
import { listCompletedPurchasesInMonth, sumPurchases } from "@/lib/month-purchases";
import { MonthlySalesClosuresRepository } from "@/repositories/monthly-sales-closures.repository";
import { loadDiscountedCantinaBreakdown } from "@/lib/compute-daily-sales-snapshot";

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
    const discounted = await loadDiscountedCantinaBreakdown(
      supabase,
      (closure.included_days ?? []).map((day) => day.business_date)
    );
    return NextResponse.json({
      ...closure,
      purchases,
      total_purchases: sumPurchases(purchases),
      products: discounted.byProduct.map((row, index) => ({
        id: index + 1,
        product_id: row.productId,
        product_name: row.productName,
        category_id: row.categoryId,
        category_name: row.categoryName,
        quantity_sold: row.quantitySold,
        total_amount: row.totalAmount,
      })),
      categories: discounted.byCategory.map((row, index) => ({
        id: index + 1,
        category_id: row.categoryId,
        category_name: row.categoryName,
        quantity_sold: row.quantitySold,
        total_amount: row.totalAmount,
      })),
    });
  } catch (err) {
    console.error("GET /monthly-sales-closures/[yearMonth] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
