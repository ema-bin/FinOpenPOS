export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backfillTeamScheduleRestrictions } from "@/lib/backfill-team-schedule-restrictions";

type RouteParams = { params: { id: string } };

/**
 * Inicializa restricciones para todos los equipos del torneo: por cada equipo inserta
 * una fila por cada slot con can_play=true para los slots que aún no tienen fila. Idempotente.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: tournamentRow, error: tournamentErr } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();

    if (tournamentErr || !tournamentRow) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const editableStatuses = new Set(["draft", "schedule_review"]);
    if (!editableStatuses.has(tournamentRow.status)) {
      return NextResponse.json(
        { error: "La disponibilidad solo se puede inicializar en borrador o revisión de horarios" },
        { status: 400 }
      );
    }

    const { data: slots, error: slotsError } = await supabase
      .from("tournament_group_slots")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (slotsError || !slots || slots.length === 0) {
      return NextResponse.json(
        { error: "El torneo no tiene horarios configurados. Configurá los horarios primero." },
        { status: 400 }
      );
    }

    const backfill = await backfillTeamScheduleRestrictions(supabase, tournamentId, user.id);

    return NextResponse.json({
      ok: true,
      teamsInitialized: backfill.teamsInitialized,
      totalInserted: backfill.totalInserted,
    });
  } catch (err) {
    console.error("POST .../teams/initialize-restrictions error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
