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
    const limit = Math.min(Number(url.searchParams.get("limit") || 30), 100);
    const repo = new DailySalesClosuresRepository(supabase);
    const closures = await repo.list(limit);
    return NextResponse.json(closures);
  } catch (err) {
    console.error("GET /daily-sales-closures error:", err);
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
      businessDate?: string;
      notes?: string;
    };

    const businessDate = parseBusinessDate(body.businessDate ?? null) ?? getCurrentBusinessDate();
    const repo = new DailySalesClosuresRepository(supabase);

    const snapshot = await computeDailySalesSnapshot(supabase, businessDate);
    const { closure, replaced } = await repo.save(user.id, snapshot, body.notes);
    return NextResponse.json({ ...closure, replaced }, { status: replaced ? 200 : 201 });
  } catch (err) {
    console.error("POST /daily-sales-closures error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
