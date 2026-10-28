export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DailySalesClosuresRepository } from "@/repositories/daily-sales-closures.repository";
import { loadDiscountedCantinaBreakdown } from "@/lib/compute-daily-sales-snapshot";

type RouteContext = { params: { date: string } };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const businessDate = params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }

    const repo = new DailySalesClosuresRepository(supabase);
    const closure = await repo.findWithDetails(businessDate);
    if (!closure) {
      return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
    }

    const discounted = await loadDiscountedCantinaBreakdown(supabase, [businessDate]);
    return NextResponse.json({
      ...closure,
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
    console.error("GET /daily-sales-closures/[date] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
