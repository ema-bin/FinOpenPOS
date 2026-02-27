export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";

type RouteParams = { params: { id: string; teamId: string } };

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tournamentId = Number(params.id);
    const teamId = Number(params.teamId);
    
    if (Number.isNaN(tournamentId) || Number.isNaN(teamId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { restricted_slot_ids, schedule_notes } = body; // Array de IDs de tournament_group_slots en los que NO puede jugar

    // Validar que el equipo existe y pertenece al torneo
    const { data: team, error: teamError } = await supabase
      .from("tournament_teams")
      .select("id, tournament_id, user_uid")
      .eq("id", teamId)
      .eq("tournament_id", tournamentId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verificar si ya hay grupos generados
    const { data: existingGroups, error: groupsError } = await supabase
      .from("tournament_groups")
      .select("id")
      .eq("tournament_id", tournamentId)
      .limit(1);

    if (groupsError) {
      console.error("Error checking groups:", groupsError);
      return NextResponse.json(
        { error: "Failed to check tournament status" },
        { status: 500 }
      );
    }

    if (existingGroups && existingGroups.length > 0) {
      return NextResponse.json(
        { error: "No se pueden editar restricciones después de generar los grupos" },
        { status: 400 }
      );
    }

    if (!Array.isArray(restricted_slot_ids)) {
      return NextResponse.json(
        { error: "restricted_slot_ids debe ser un array" },
        { status: 400 }
      );
    }

    const restrictedSet = new Set(
      restricted_slot_ids.filter((id: unknown) => Number.isInteger(Number(id)) && Number(id) > 0) as number[]
    );

    // Traer todos los slots del torneo
    const { data: allSlots, error: slotsError } = await supabase
      .from("tournament_group_slots")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (slotsError) {
      return NextResponse.json(
        { error: "Error al obtener slots del torneo" },
        { status: 500 }
      );
    }

    const tournamentSlotIds = (allSlots ?? []).map((s: { id: number }) => s.id);
    if (restrictedSet.size > 0) {
      const invalid = [...restrictedSet].filter((id) => !tournamentSlotIds.includes(id));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: "Algunos IDs de slot no pertenecen a este torneo" },
          { status: 400 }
        );
      }
    }

    // Reemplazar restricciones: una fila por slot con can_play = true si NO está en restricted
    const { error: deleteError } = await supabase
      .from("tournament_team_schedule_restrictions")
      .delete()
      .eq("tournament_team_id", teamId);

    if (deleteError) {
      console.error("Error deleting existing restrictions:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete existing restrictions" },
        { status: 500 }
      );
    }

    if (tournamentSlotIds.length > 0) {
      const rows = tournamentSlotIds.map((slotId: number) => ({
        tournament_team_id: teamId,
        tournament_group_slot_id: slotId,
        can_play: !restrictedSet.has(slotId),
        user_uid: user.id,
      }));

      const { error: insertError } = await supabase
        .from("tournament_team_schedule_restrictions")
        .insert(rows);

      if (insertError) {
        console.error("Error inserting restrictions:", insertError);
        return NextResponse.json(
          { error: "Failed to insert restrictions" },
          { status: 500 }
        );
      }
    }

    // Actualizar schedule_notes si se proporcionó
    if (schedule_notes !== undefined) {
      const repos = await createRepositories();
      await repos.tournamentTeams.update(teamId, { schedule_notes: schedule_notes || null });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /tournaments/:id/teams/:teamId/restrictions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
