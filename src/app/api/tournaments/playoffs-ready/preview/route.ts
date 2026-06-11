export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  BulkPlayoffsPlanError,
  planBulkPlayoffsPreview,
} from "@/lib/plan-bulk-playoffs-preview";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bodyRaw = await req.json().catch(() => ({}));
  const body =
    typeof bodyRaw === "object" && bodyRaw !== null
      ? (bodyRaw as Record<string, unknown>)
      : {};

  try {
    const preview = await planBulkPlayoffsPreview(supabase, body);
    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof BulkPlayoffsPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST playoffs-ready preview error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
