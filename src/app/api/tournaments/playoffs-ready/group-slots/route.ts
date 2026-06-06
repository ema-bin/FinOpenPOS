import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPlayoffMatchesPlan } from "@/lib/playoff-matches-plan";

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
    .eq("status", "playoffs_ready")
    .order("id", { ascending: true });

  if (tournamentsError) {
    return NextResponse.json({ error: tournamentsError.message }, { status: 500 });
  }

  const readyTournaments = Array.isArray(tournaments) ? tournaments : [];
  const tournamentIds = readyTournaments.map((t) => t.id);
  const nameById = new Map(
    readyTournaments.map((t) => [t.id, t.name?.trim() || `Torneo ${t.id}`])
  );

  if (tournamentIds.length === 0) {
    return NextResponse.json({ slots: [], totalPlayoffMatches: 0 });
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

  let totalPlayoffMatches = 0;
  for (const t of readyTournaments) {
    const plan = await buildPlayoffMatchesPlan(supabase, t.id);
    if (plan.ok) totalPlayoffMatches += plan.needingSchedule;
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
    totalPlayoffMatches,
  });
}
