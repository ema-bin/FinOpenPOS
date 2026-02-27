export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: { id: string } };

/**
 * Inicializa restricciones para todos los equipos del torneo: por cada equipo inserta
 * una fila por cada slot con can_play=true para los slots que aún no tienen fila. Idempotente.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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

    const slotIds = slots.map((s: { id: number }) => s.id);

    const { data: teams, error: teamsError } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (teamsError || !teams || teams.length === 0) {
      return NextResponse.json({ ok: true, teamsInitialized: 0, totalInserted: 0 });
    }

    const { data: existingRows } = await supabase
      .from("tournament_team_schedule_restrictions")
      .select("tournament_team_id, tournament_group_slot_id")
      .in("tournament_team_id", teams.map((t: { id: number }) => t.id));

    const existingSet = new Set(
      (existingRows ?? []).map(
        (r: { tournament_team_id: number; tournament_group_slot_id: number }) =>
          `${r.tournament_team_id}-${r.tournament_group_slot_id}`
      )
    );

    const toInsert: Array<{ tournament_team_id: number; tournament_group_slot_id: number; can_play: boolean; user_uid: string }> = [];
    for (const team of teams) {
      for (const slotId of slotIds) {
        if (!existingSet.has(`${team.id}-${slotId}`)) {
          toInsert.push({
            tournament_team_id: team.id,
            tournament_group_slot_id: slotId,
            can_play: true,
            user_uid: user.id,
          });
        }
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("tournament_team_schedule_restrictions")
        .insert(toInsert);

      if (insertError) {
        console.error("Error initializing all restrictions:", insertError);
        return NextResponse.json(
          { error: "Error al inicializar disponibilidad de los equipos" },
          { status: 500 }
        );
      }
    }

    const teamsNeedingInit = new Set(toInsert.map((r) => r.tournament_team_id));
    return NextResponse.json({
      ok: true,
      teamsInitialized: teamsNeedingInit.size,
      totalInserted: toInsert.length,
    });
  } catch (err) {
    console.error("POST .../teams/initialize-restrictions error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
