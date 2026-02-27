export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: { id: string; teamId: string } };

/**
 * Inicializa restricciones del equipo: inserta una fila por cada slot del torneo con can_play=true
 * para los slots que aún no tienen fila. Idempotente.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tournamentId = Number(params.id);
    const teamId = Number(params.teamId);
    if (Number.isNaN(tournamentId) || Number.isNaN(teamId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: team, error: teamError } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("id", teamId)
      .eq("tournament_id", tournamentId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const { data: slots, error: slotsError } = await supabase
      .from("tournament_group_slots")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (slotsError || !slots || slots.length === 0) {
      return NextResponse.json(
        { error: "El torneo no tiene horarios (slots) configurados. Configurá los horarios primero." },
        { status: 400 }
      );
    }

    const slotIds = slots.map((s: { id: number }) => s.id);

    const { data: existing } = await supabase
      .from("tournament_team_schedule_restrictions")
      .select("tournament_group_slot_id")
      .eq("tournament_team_id", teamId);

    const existingSlotIds = new Set((existing ?? []).map((r: { tournament_group_slot_id: number }) => r.tournament_group_slot_id));
    const toInsert = slotIds.filter((id: number) => !existingSlotIds.has(id));

    if (toInsert.length > 0) {
      const rows = toInsert.map((tournament_group_slot_id: number) => ({
        tournament_team_id: teamId,
        tournament_group_slot_id,
        can_play: true,
        user_uid: user.id,
      }));
      const { error: insertError } = await supabase
        .from("tournament_team_schedule_restrictions")
        .insert(rows);

      if (insertError) {
        console.error("Error initializing restrictions:", insertError);
        return NextResponse.json(
          { error: "Error al inicializar disponibilidad" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, inserted: toInsert.length });
  } catch (err) {
    console.error("POST .../restrictions/initialize error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
