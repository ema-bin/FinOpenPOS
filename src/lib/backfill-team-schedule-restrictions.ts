import type { SupabaseClient } from "@supabase/supabase-js";

export type BackfillScheduleRestrictionsResult = {
  teamsInitialized: number;
  totalInserted: number;
};

/**
 * Inserta filas faltantes en tournament_team_schedule_restrictions (can_play=true).
 * Idempotente: no modifica restricciones existentes.
 */
export async function backfillTeamScheduleRestrictions(
  supabase: SupabaseClient,
  tournamentId: number,
  userId: string,
  slotIds?: number[],
  defaultCanPlay = true
): Promise<BackfillScheduleRestrictionsResult> {
  const { data: slots, error: slotsError } = await supabase
    .from("tournament_group_slots")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (slotsError || !slots || slots.length === 0) {
    return { teamsInitialized: 0, totalInserted: 0 };
  }

  const allSlotIds = slots.map((s: { id: number }) => s.id);
  const targetSlotIds =
    slotIds && slotIds.length > 0
      ? slotIds.filter((id) => allSlotIds.includes(id))
      : allSlotIds;

  if (targetSlotIds.length === 0) {
    return { teamsInitialized: 0, totalInserted: 0 };
  }

  const { data: teams, error: teamsError } = await supabase
    .from("tournament_teams")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (teamsError || !teams || teams.length === 0) {
    return { teamsInitialized: 0, totalInserted: 0 };
  }

  const { data: existingRows } = await supabase
    .from("tournament_team_schedule_restrictions")
    .select("tournament_team_id, tournament_group_slot_id")
    .in(
      "tournament_team_id",
      teams.map((t: { id: number }) => t.id)
    );

  const existingSet = new Set(
    (existingRows ?? []).map(
      (r: { tournament_team_id: number; tournament_group_slot_id: number }) =>
        `${r.tournament_team_id}-${r.tournament_group_slot_id}`
    )
  );

  const toInsert: Array<{
    tournament_team_id: number;
    tournament_group_slot_id: number;
    can_play: boolean;
    user_uid: string;
  }> = [];

  for (const team of teams) {
    for (const slotId of targetSlotIds) {
      if (!existingSet.has(`${team.id}-${slotId}`)) {
        toInsert.push({
          tournament_team_id: team.id,
          tournament_group_slot_id: slotId,
          can_play: defaultCanPlay,
          user_uid: userId,
        });
      }
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("tournament_team_schedule_restrictions")
      .insert(toInsert);

    if (insertError) {
      throw new Error(`Error al inicializar disponibilidad de los equipos: ${insertError.message}`);
    }
  }

  const teamsNeedingInit = new Set(toInsert.map((r) => r.tournament_team_id));
  return {
    teamsInitialized: teamsNeedingInit.size,
    totalInserted: toInsert.length,
  };
}
