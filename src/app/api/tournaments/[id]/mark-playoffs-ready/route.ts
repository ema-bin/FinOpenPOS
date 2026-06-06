export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupMatchHasResult } from "@/lib/group-match-results";

type RouteParams = { params: { id: string } };

/**
 * Marca el torneo como listo para playoffs (grupos finalizados).
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournamentId = Number(params.id);
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, status")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.status !== "in_progress") {
      return NextResponse.json(
        { error: "El torneo debe estar en fase de grupos (en progreso) para marcarlo listo para playoffs." },
        { status: 400 }
      );
    }

    const { data: groups, error: groupsError } = await supabase
      .from("tournament_groups")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (groupsError) {
      return NextResponse.json({ error: "Error al verificar zonas" }, { status: 500 });
    }
    if (!groups?.length) {
      return NextResponse.json(
        { error: "No hay zonas creadas en este torneo." },
        { status: 400 }
      );
    }

    const { data: existingPlayoffs, error: playoffsError } = await supabase
      .from("tournament_playoffs")
      .select("id")
      .eq("tournament_id", tournamentId)
      .limit(1);

    if (playoffsError) {
      return NextResponse.json({ error: "Error al verificar playoffs" }, { status: 500 });
    }
    if (existingPlayoffs?.length) {
      return NextResponse.json(
        { error: "Este torneo ya tiene playoffs generados." },
        { status: 400 }
      );
    }

    const { data: groupMatches, error: matchesError } = await supabase
      .from("tournament_matches")
      .select("id, set1_team1_games, set1_team2_games")
      .eq("tournament_id", tournamentId)
      .eq("phase", "group");

    if (matchesError) {
      return NextResponse.json({ error: "Error al verificar partidos de zona" }, { status: 500 });
    }
    if (!groupMatches?.length) {
      return NextResponse.json(
        { error: "No hay partidos de zona en este torneo." },
        { status: 400 }
      );
    }

    const pending = groupMatches.filter((m) => !groupMatchHasResult(m));
    if (pending.length > 0) {
      return NextResponse.json(
        {
          error: `Faltan ${pending.length} partido(s) de zona sin resultado cargado antes de marcar listo para playoffs.`,
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({ status: "playoffs_ready" })
      .eq("id", tournamentId);

    if (updateError) {
      return NextResponse.json(
        { error: "No se pudo actualizar el estado del torneo" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Torneo marcado como listo para playoffs.",
    });
  } catch (error) {
    console.error("POST mark-playoffs-ready error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
