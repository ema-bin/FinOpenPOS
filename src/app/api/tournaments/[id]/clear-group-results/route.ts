export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGroupTestToolsEnabledServer } from "@/lib/group-test-tools";

type RouteParams = { params: { id: string } };

/**
 * Limpia todos los resultados de partidos de zona (solo testing).
 * Requiere ENABLE_GROUP_TEST_TOOLS o NEXT_PUBLIC_ENABLE_GROUP_TEST_TOOLS.
 */
export async function POST(req: Request, { params }: RouteParams) {
  if (!isGroupTestToolsEnabledServer()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournamentId = Number(params.id);
  if (Number.isNaN(tournamentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
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
        { error: "No se pueden limpiar resultados una vez generados los playoffs" },
        { status: 403 }
      );
    }

    const { data: matches, error: matchesError } = await supabase
      .from("tournament_matches")
      .select("id, status, set1_team1_games, set1_team2_games")
      .eq("tournament_id", tournamentId)
      .eq("phase", "group");

    if (matchesError) {
      console.error("Error fetching group matches:", matchesError);
      return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
    }

    const matchesWithResults = (matches ?? []).filter(
      (m) =>
        m.status === "finished" ||
        m.status === "in_progress" ||
        m.set1_team1_games !== null ||
        m.set1_team2_games !== null
    );

    if (matchesWithResults.length === 0) {
      return NextResponse.json({ error: "No hay resultados para limpiar" }, { status: 400 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authToken = session?.access_token;

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const cleared: number[] = [];
    const errors: { matchId: number; error: string }[] = [];

    for (const match of matchesWithResults) {
      try {
        const resultRes = await fetch(`${baseUrl}/api/tournament-matches/${match.id}/result`, {
          method: "DELETE",
          headers: {
            ...(authToken && { Authorization: `Bearer ${authToken}` }),
            Cookie: req.headers.get("Cookie") || "",
          },
        });

        if (!resultRes.ok) {
          const errorData = await resultRes.json().catch(() => ({}));
          errors.push({
            matchId: match.id,
            error: errorData.error || "Unknown error",
          });
          continue;
        }

        cleared.push(match.id);
      } catch (error) {
        errors.push({
          matchId: match.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const { data: tournament } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();

    if (tournament?.status === "playoffs_ready" && cleared.length > 0) {
      await supabase
        .from("tournaments")
        .update({ status: "in_progress" })
        .eq("id", tournamentId);
    }

    return NextResponse.json({
      ok: true,
      message: `Se limpiaron ${cleared.length} partido(s)${errors.length > 0 ? `, ${errors.length} con errores` : ""}`,
      clearedCount: cleared.length,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    console.error("Error clearing group results:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
