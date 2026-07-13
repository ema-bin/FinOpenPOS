export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DailySalesClosuresRepository } from "@/repositories/daily-sales-closures.repository";

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

    return NextResponse.json(closure);
  } catch (err) {
    console.error("GET /daily-sales-closures/[date] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
