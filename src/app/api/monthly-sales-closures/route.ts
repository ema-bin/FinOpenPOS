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
    const limit = Math.min(Number(url.searchParams.get("limit") || 24), 100);
    const repo = new MonthlySalesClosuresRepository(supabase);
    const closures = await repo.list(limit);
    return NextResponse.json(closures);
  } catch (err) {
    console.error("GET /monthly-sales-closures error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      yearMonth?: string;
      notes?: string;
    };

    const yearMonth = parseYearMonth(body.yearMonth ?? null) ?? getCurrentYearMonth();
    const snapshot = await aggregateMonthlySalesClosure(supabase, yearMonth);
    const repo = new MonthlySalesClosuresRepository(supabase);
    const { closure, replaced } = await repo.save(user.id, snapshot, body.notes);
    return NextResponse.json({ ...closure, replaced }, { status: replaced ? 200 : 201 });
  } catch (err) {
    console.error("POST /monthly-sales-closures error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
