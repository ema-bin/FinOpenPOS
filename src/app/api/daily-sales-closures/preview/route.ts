export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusinessDate } from "@/lib/business-day";
import { computeDailySalesSnapshot } from "@/lib/compute-daily-sales-snapshot";
import { DailySalesClosuresRepository } from "@/repositories/daily-sales-closures.repository";

function parseBusinessDate(value: string | null): string | null {
  if (!value?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const businessDate =
      parseBusinessDate(url.searchParams.get("date")) ?? getCurrentBusinessDate();

    const repo = new DailySalesClosuresRepository(supabase);
    const preview = await computeDailySalesSnapshot(supabase, businessDate);
    const existing = await repo.findWithDetails(businessDate);

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
    console.error("GET /daily-sales-closures/preview error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
