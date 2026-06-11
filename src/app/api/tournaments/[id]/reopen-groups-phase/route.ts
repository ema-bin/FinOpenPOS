export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: { id: string } };

/** Vuelve de playoffs_ready a in_progress (sin playoffs generados). */
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

    if (tournament.status !== "playoffs_ready") {
      return NextResponse.json(
        { error: "Solo se puede reabrir la fase de grupos desde el estado listo para playoffs." },
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
        { error: "No se puede reabrir: ya hay playoffs generados." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({ status: "in_progress" })
      .eq("id", tournamentId);

    if (updateError) {
      return NextResponse.json(
        { error: "No se pudo actualizar el estado del torneo" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST reopen-groups-phase error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
