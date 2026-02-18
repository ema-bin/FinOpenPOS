export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeAndSaveTournamentRankingPoints } from "@/lib/tournament-ranking-points";

type RouteParams = { params: { id: string } };

export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, status")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.status === "finished") {
      return NextResponse.json({ error: "Tournament already finished" }, { status: 400 });
    }

    if (tournament.status === "cancelled") {
      return NextResponse.json({ error: "Tournament is cancelled" }, { status: 400 });
    }

    if (tournament.status !== "in_progress") {
      return NextResponse.json(
        { error: "Tournament must be in progress to finish" },
        { status: 400 }
      );
    }

    const { data: pendingMatches, error: pendingMatchesError } = await supabase
      .from("tournament_matches")
      .select("id, phase")
      .eq("tournament_id", tournamentId)
      .neq("status", "finished")
      .not("team1_id", "is", null)
      .not("team2_id", "is", null);

    if (pendingMatchesError) {
      console.error("Error checking match results:", pendingMatchesError);
      return NextResponse.json(
        { error: "Failed to verify match results" },
        { status: 500 }
      );
    }

    if (pendingMatches && pendingMatches.length > 0) {
      const countsByPhase = pendingMatches.reduce<Record<string, number>>(
        (acc, match) => {
          acc[match.phase] = (acc[match.phase] ?? 0) + 1;
          return acc;
        },
        {}
      );
      const phaseLabels: Record<string, string> = {
        group: "fase de grupos",
        playoff: "playoffs",
      };
      const phaseSummary = Object.entries(countsByPhase)
        .map(([phase, count]) => `${count} de ${phaseLabels[phase] ?? phase}`)
        .join(" y ");

      return NextResponse.json(
        {
          error: `Aún hay partidos sin resultados (${phaseSummary}). Cargálos antes de finalizar.`,
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({ status: "finished" })
      .eq("id", tournamentId);

    if (updateError) {
      console.error("Error finishing tournament:", updateError);
      return NextResponse.json(
        { error: "Failed to finish tournament" },
        { status: 500 }
      );
    }

    // Si el torneo es puntuable, calcular y guardar puntos de ranking por jugador (categoría del torneo, año en curso).
    try {
      await computeAndSaveTournamentRankingPoints(supabase, tournamentId);
    } catch (rankErr) {
      console.error("Error saving ranking points:", rankErr);
      return NextResponse.json(
        { error: "Torneo finalizado pero no se pudieron guardar los puntos de ranking. Contactá al administrador." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Tournament marked as finished" });
  } catch (error) {
    console.error("POST /tournaments/:id/finish error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
