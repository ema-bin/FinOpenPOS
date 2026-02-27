export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: { id: string } };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: slots, error } = await supabase
      .from("tournament_group_slots")
      .select("id, slot_date, start_time, end_time")
      .eq("tournament_id", tournamentId)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching group slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch slots" },
        { status: 500 }
      );
    }

    return NextResponse.json(slots ?? []);
  } catch (err) {
    console.error("GET /tournaments/:id/group-slots error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
