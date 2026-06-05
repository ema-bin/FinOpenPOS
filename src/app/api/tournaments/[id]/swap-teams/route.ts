export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { swapTournamentTeams } from "@/lib/tournament-team-swap";

type RouteParams = { params: { id: string } };

/**
 * Intercambia una pareja por otra: reemplaza todas las referencias de team1 por team2 y viceversa.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournamentId = Number(params.id);
  if (Number.isNaN(tournamentId)) {
    return NextResponse.json({ error: "Invalid tournament id" }, { status: 400 });
  }

  const body = await req.json();
  const { team1Id, group1Id, team2Id, group2Id } = body as {
    team1Id: number;
    group1Id: number;
    team2Id: number;
    group2Id: number;
  };

  if (!team1Id || !group1Id || !team2Id || !group2Id) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    await swapTournamentTeams(supabase, user.id, tournamentId, {
      team1Id,
      group1Id,
      team2Id,
      group2Id,
    });

    return NextResponse.json({ ok: true, message: "Teams swapped successfully" });
  } catch (error) {
    console.error("Error swapping teams:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
