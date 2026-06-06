export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPlayoffMatchesPlan } from "@/lib/playoff-matches-plan";
import { playoffSlotIntervalFromMinutes } from "@/lib/playoff-schedule-slots";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, match_duration, match_duration_quarters_onwards, status"
    )
    .eq("status", "playoffs_ready")
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = tournaments ?? [];
  let totalPlayoffMatches = 0;
  let maxPlayoffSlotInterval = 60;
  const perTournament: Array<{
    id: number;
    name: string;
    playoffMatches: number;
    error?: string;
  }> = [];

  for (const t of list) {
    const playoffMin = Math.max(
      15,
      t.match_duration_quarters_onwards ?? t.match_duration ?? 60
    );
    maxPlayoffSlotInterval = Math.max(
      maxPlayoffSlotInterval,
      playoffSlotIntervalFromMinutes(playoffMin)
    );

    const plan = await buildPlayoffMatchesPlan(supabase, t.id);
    if (!plan.ok) {
      perTournament.push({
        id: t.id,
        name: t.name,
        playoffMatches: 0,
        error: plan.error,
      });
      continue;
    }
    perTournament.push({
      id: t.id,
      name: t.name,
      playoffMatches: plan.needingSchedule,
    });
    totalPlayoffMatches += plan.needingSchedule;
  }

  return NextResponse.json({
    tournamentCount: list.length,
    totalPlayoffMatches,
    maxPlayoffSlotInterval,
    maxPlayoffDurationMinutes: Math.max(
      60,
      ...list.map(
        (t) =>
          t.match_duration_quarters_onwards ?? t.match_duration ?? 60
      )
    ),
    tournaments: perTournament,
  });
}
