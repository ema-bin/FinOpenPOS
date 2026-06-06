export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CloseGroupsError, runCloseGroups } from "@/lib/execute-close-groups";

type RouteParams = { params: { id: string } };

export async function POST(req: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournamentId = Number(params.id);
  if (Number.isNaN(tournamentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const bodyRaw = await req.json().catch(() => ({}));
  const body =
    typeof bodyRaw === "object" && bodyRaw !== null
      ? (bodyRaw as Record<string, unknown>)
      : {};

  try {
    await runCloseGroups(supabase, user.id, tournamentId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CloseGroupsError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST close-groups error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
