import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("status", "schedule_review");

  if (tournamentsError) {
    return NextResponse.json(
      { error: tournamentsError.message },
      { status: 500 }
    );
  }

  const scheduleReviewTournaments = Array.isArray(tournaments) ? tournaments : [];
  const tournamentIds = scheduleReviewTournaments.map((t) => t.id);
  const nameById = new Map(
    scheduleReviewTournaments.map((t) => [t.id, t.name?.trim() || `Torneo ${t.id}`])
  );

  if (tournamentIds.length === 0) {
    return NextResponse.json({ slots: [], pendingGroupMatchCount: 0 });
  }

  const { data: slots, error: slotsError } = await supabase
    .from("tournament_group_slots")
    .select("id, tournament_id, slot_date, start_time, end_time")
    .in("tournament_id", tournamentIds)
    .order("slot_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (slotsError) {
    return NextResponse.json({ error: slotsError.message }, { status: 500 });
  }

  const { count: pendingCount, error: countError } = await supabase
    .from("tournament_matches")
    .select("id", { count: "exact", head: true })
    .in("tournament_id", tournamentIds)
    .eq("phase", "group")
    .is("set1_team1_games", null);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const enriched = (slots ?? []).map(
    (s: {
      id: number;
      tournament_id: number;
      slot_date: string;
      start_time: string;
      end_time: string;
    }) => ({
      id: s.id,
      tournament_id: s.tournament_id,
      slot_date: s.slot_date,
      start_time: s.start_time,
      end_time: s.end_time,
      tournament_name: nameById.get(s.tournament_id) ?? "",
    })
  );

  return NextResponse.json({
    slots: enriched,
    pendingGroupMatchCount: pendingCount ?? 0,
  });
}
