import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTeamDisplayOrderMap,
  sortTeamIdsWithZoneHeadFirst,
} from "@/lib/group-zone-team-order";
import {
  MASTERS_TEAM_COUNT,
  assignMastersZones,
  mastersRoundRobinPairs,
} from "@/lib/masters-tournament";

const ZONE_LETTERS = ["A", "B"] as const;

/**
 * Cierra la inscripción de un Master: 2 zonas de 4 y 6 partidos por zona.
 * No pasa por el armado de zonas del formato de siempre.
 */
export async function closeMastersRegistration(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: number
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: teams, error: teamsError } = await supabase
    .from("tournament_teams")
    .select("id, display_order")
    .eq("tournament_id", tournamentId)
    .eq("is_substitute", false)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (teamsError) {
    console.error("Error fetching masters teams:", teamsError);
    return { ok: false, error: "No se pudieron leer las parejas", status: 500 };
  }

  const rows = (teams ?? []) as Array<{ id: number; display_order?: number | null }>;
  if (rows.length !== MASTERS_TEAM_COUNT) {
    return {
      ok: false,
      error: `Un Master necesita exactamente 8 parejas (hay ${rows.length}).`,
      status: 400,
    };
  }

  const groupsPayload = ZONE_LETTERS.map((letter, index) => ({
    name: `Zona ${letter}`,
    tournament_id: tournamentId,
    user_uid: userId,
    group_order: index + 1,
  }));

  const { data: createdGroups, error: groupError } = await supabase
    .from("tournament_groups")
    .insert(groupsPayload)
    .select("id, group_order")
    .order("group_order", { ascending: true });

  if (groupError || !createdGroups || createdGroups.length !== 2) {
    console.error("Error creating masters groups:", groupError);
    return { ok: false, error: "No se pudieron crear las zonas", status: 500 };
  }

  const [zoneA, zoneB] = assignMastersZones(rows.map((team) => team.id));
  const displayOrder = buildTeamDisplayOrderMap(rows);
  const zones = [zoneA, zoneB].map((teamIds) =>
    sortTeamIdsWithZoneHeadFirst(teamIds, displayOrder)
  );

  const groupTeamsPayload: Array<{
    tournament_group_id: number;
    team_id: number;
    user_uid: string;
  }> = [];
  const matchesPayload: Array<{
    tournament_id: number;
    user_uid: string;
    phase: "group";
    tournament_group_id: number;
    team1_id: number;
    team2_id: number;
    match_date: null;
    start_time: null;
    end_time: null;
    court_id: null;
    match_order: number;
    status: "scheduled";
  }> = [];

  createdGroups.forEach((group, index) => {
    const teamIds = zones[index] ?? [];
    teamIds.forEach((teamId) => {
      groupTeamsPayload.push({
        tournament_group_id: group.id,
        team_id: teamId,
        user_uid: userId,
      });
    });
    mastersRoundRobinPairs(teamIds).forEach(([team1Id, team2Id], matchIndex) => {
      matchesPayload.push({
        tournament_id: tournamentId,
        user_uid: userId,
        phase: "group",
        tournament_group_id: group.id,
        team1_id: team1Id,
        team2_id: team2Id,
        match_date: null,
        start_time: null,
        end_time: null,
        court_id: null,
        match_order: matchIndex + 1,
        status: "scheduled",
      });
    });
  });

  const { error: groupTeamsError } = await supabase
    .from("tournament_group_teams")
    .insert(groupTeamsPayload);
  if (groupTeamsError) {
    console.error("Error inserting masters group teams:", groupTeamsError);
    return { ok: false, error: "No se pudieron asignar las parejas a las zonas", status: 500 };
  }

  const { error: matchesError } = await supabase
    .from("tournament_matches")
    .insert(matchesPayload);
  if (matchesError) {
    console.error("Error inserting masters matches:", matchesError);
    return { ok: false, error: "No se pudieron crear los partidos", status: 500 };
  }

  const { error: statusError } = await supabase
    .from("tournaments")
    .update({ status: "schedule_review" })
    .eq("id", tournamentId);
  if (statusError) {
    console.error("Error updating masters status:", statusError);
    return { ok: false, error: "No se pudo actualizar el estado del torneo", status: 500 };
  }

  return { ok: true };
}
