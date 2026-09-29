import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePlayoffs } from "@/lib/tournament-playoffs";
import {
  buildPlayoffScheduleSlots,
  parseExplicitPlayoffSlots,
  parseScheduleConfigFromBody,
} from "@/lib/playoff-schedule-slots";

import type { ScheduleConfig } from "@/models/dto/tournament";

export class CloseGroupsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "CloseGroupsError";
  }
}

import type { TournamentMatch } from "@/models/db/tournament";
import { assignPlayoffScheduleSlots } from "@/lib/assign-playoff-schedule-to-matches";
import { slotIntervalMinutesForPlayoffScheduling } from "@/lib/playoff-match-duration";
import {
  aggregateGroupStandingsFromMatches,
  computeQualifiedTeamsForGroup,
  rankedStandingsForGroup,
  type StandingsMatchInput,
} from "@/lib/tournament-group-standings";

// Using Pick from TournamentMatch for internal processing
type MatchRow = Pick<
  TournamentMatch,
  | "id"
  | "tournament_group_id"
  | "team1_id"
  | "team2_id"
  | "team1_sets"
  | "team2_sets"
  | "team1_games_total"
  | "team2_games_total"
  | "status"
  | "match_order"
>;

export async function runCloseGroups(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: number,
  body: Record<string, unknown>
): Promise<void> {
  const scheduleConfig = parseScheduleConfigFromBody(body);
  const explicitPlayoffSlots = parseExplicitPlayoffSlots(body);

  // 1) torneo
  const { data: t, error: terr } = await supabase
    .from("tournaments")
    .select("id, status, user_uid, match_duration, match_duration_quarters_onwards")
    .eq("id", tournamentId)
    .single();

  if (terr || !t) {
    throw new CloseGroupsError("Tournament not found", 404);
  }

  if (t.status !== "playoffs_ready" && t.status !== "in_progress") {
    throw new CloseGroupsError(
      "El torneo debe estar listo para playoffs o en progreso para generar la llave",
      400
    );
  }

  // Verificar si ya existen playoffs
  const { data: existingPlayoffs, error: existingPlayoffsError } = await supabase
    .from("tournament_playoffs")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1);

  if (existingPlayoffsError) {
    console.error("Error checking existing playoffs:", existingPlayoffsError);
    throw new CloseGroupsError("Failed to check existing playoffs", 500);
  }

  if (existingPlayoffs && existingPlayoffs.length > 0) {
    throw new CloseGroupsError(
      "Playoffs already generated for this tournament",
      400
    );
  }

  // 2) grupos
  const { data: groups, error: gError } = await supabase
    .from("tournament_groups")
    .select("id, name")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (gError || !groups || groups.length === 0) {
    throw new CloseGroupsError("No groups found", 400);
  }

  const groupIds = groups.map((g) => g.id);

  // 3) group_teams -> para saber tamaño de cada grupo
  const { data: groupTeams, error: gtError } = await supabase
    .from("tournament_group_teams")
    .select("tournament_group_id, team_id")
    .in("tournament_group_id", groupIds);

  if (gtError || !groupTeams) {
    console.error("Error fetching group_teams:", gtError);
    throw new CloseGroupsError("Failed to fetch group teams", 500);
  }

  // 4) partidos de grupos ya jugados
  const { data: matches, error: mError } = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_group_id, team1_id, team2_id, team1_sets, team2_sets, team1_games_total, team2_games_total, status, match_order, court_id"
    )
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (mError || !matches) {
    console.error("Error fetching matches:", mError);
    throw new CloseGroupsError("Failed to fetch matches", 500);
  }

  const standingsMap = aggregateGroupStandingsFromMatches(
    matches as StandingsMatchInput[]
  );

  // 6) guardar standings en tabla tournament_group_standings (reemplazar)
  await supabase
    .from("tournament_group_standings")
    .delete()
    .in("tournament_group_id", groupIds);

  const standingsInsert: any[] = [];
  const qualifiedTeams: { team_id: number; from_group_id: number; pos: number }[] =
    [];

  for (const g of groups) {
    const gid = g.id;
    const map = standingsMap.get(gid) ?? new Map();

    const groupTeamIds = groupTeams
      .filter((gt) => gt.tournament_group_id === gid)
      .map((gt) => gt.team_id);

    const groupMatches = (matches as MatchRow[]).filter(
      (m) => m.tournament_group_id === gid
    );
    const stats = rankedStandingsForGroup(
      groupTeamIds,
      groupMatches as StandingsMatchInput[],
      map
    );

    // insertar standings con posición
    stats.forEach((s, index) =>
      standingsInsert.push({
        tournament_group_id: gid,
        team_id: s.team_id,
        user_uid: userId,
        matches_played: s.matches_played,
        wins: s.wins,
        losses: s.losses,
        sets_won: s.sets_won,
        sets_lost: s.sets_lost,
        games_won: s.games_won,
        games_lost: s.games_lost,
        position: index + 1, // Guardar la posición (1, 2, 3, ...)
      })
    );

    // determinar cuántos clasifican por tamaño del grupo
    // Zonas de 3 equipos: pasan 2
    // Zonas de 4 equipos: pasan 3
    const qualifiers = computeQualifiedTeamsForGroup(
      gid,
      groupTeamIds,
      groupMatches as StandingsMatchInput[],
      map
    );
    qualifiedTeams.push(...qualifiers);
  }

  if (standingsInsert.length > 0) {
    const { error: siError } = await supabase
      .from("tournament_group_standings")
      .insert(standingsInsert);
    if (siError) {
      console.error("Error inserting standings:", siError);
      throw new CloseGroupsError("Failed to save standings", 500);
    }
  }

  // 7) generar playoffs: bracket completo con todas las rondas
  if (qualifiedTeams.length < 2) {
    throw new CloseGroupsError(
      "Not enough qualified teams for playoffs",
      400
    );
  }

  // Obtener grupos ordenados para construir el mapa de group_order
  const { data: groupsOrdered, error: groupsOrderError } = await supabase
    .from("tournament_groups")
    .select("id, group_order")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (groupsOrderError || !groupsOrdered) {
    console.error("Error fetching groups order:", groupsOrderError);
    throw new CloseGroupsError("Failed to fetch groups order", 500);
  }

  // Crear mapa de group_id -> group_order
  const groupOrderMap = new Map<number, number>();
  groupsOrdered.forEach((g) => {
    groupOrderMap.set(g.id, g.group_order);
  });

  const totalPairs = groupTeams?.length ?? 0;
  const allMatches = generatePlayoffs(qualifiedTeams, groupOrderMap, totalPairs);

  /** Todos los partidos de playoffs usan esta duración (DB). */
  const playoffMin = Math.max(
    15,
    t.match_duration_quarters_onwards ?? t.match_duration ?? 60
  );
  const playoffSlotInterval = slotIntervalMinutesForPlayoffScheduling(playoffMin);

  // Asignar horarios cuando hay slots del torneo por cancha o grilla días × canchas
  const usePhysicalSelections =
    scheduleConfig &&
    (scheduleConfig.selectedPhysicalSlots?.length ?? 0) > 0 &&
    scheduleConfig.courtIds.length > 0;

  const useLegacyDaysGrid =
    scheduleConfig &&
    scheduleConfig.days.length > 0 &&
    scheduleConfig.courtIds.length > 0 &&
    !(scheduleConfig.selectedPhysicalSlots?.length);

  let scheduleSlots: Array<{ date: string; startTime: string; court_id: number }> | null =
    explicitPlayoffSlots;

  if (!scheduleSlots) {
    if (usePhysicalSelections && scheduleConfig?.selectedPhysicalSlots?.length) {
      scheduleSlots = buildPlayoffScheduleSlots(scheduleConfig, playoffMin);
      if (!scheduleSlots?.length) {
        throw new CloseGroupsError(
          "Las ventanas elegidas no generan ningún hueco valido para partidos de playoff (revisa la duracion de eliminatoria y los horarios del torneo).",
          400
        );
      }
    } else if (useLegacyDaysGrid && scheduleConfig) {
      scheduleSlots = buildPlayoffScheduleSlots(scheduleConfig, playoffSlotInterval);
    }
  }

  let allMatchesWithSchedule = allMatches.map((m) => ({
    ...m,
    match_date: null as string | null,
    start_time: null as string | null,
    end_time: null as string | null,
    court_id: null as number | null,
  }));

  if (scheduleSlots && scheduleSlots.length > 0) {
    try {
      allMatchesWithSchedule = assignPlayoffScheduleSlots(
        allMatches,
        scheduleSlots,
        playoffMin
      );
    } catch (e) {
      throw new CloseGroupsError(
        e instanceof Error ? e.message : "Error al asignar horarios",
        400
      );
    }
  }

  // Insertar todos los partidos en la base de datos
  const playoffMatchesPayload: any[] = allMatchesWithSchedule.map((m: any) => ({
    tournament_id: tournamentId,
    user_uid: userId,
    phase: "playoff",
    tournament_group_id: null,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    status: "scheduled",
    match_date: m.match_date || null,
    start_time: m.start_time || null,
    end_time: m.end_time || null,
    court_id: m.court_id || null,
  }));

  const { data: createdMatches, error: cmError } = await supabase
    .from("tournament_matches")
    .insert(playoffMatchesPayload)
    .select("id");

  if (cmError || !createdMatches) {
    console.error("Error creating playoff matches:", cmError);
    throw new CloseGroupsError("Failed to create playoff matches", 500);
  }

  // Crear las filas de tournament_playoffs con referencias correctas
  const playoffRows: any[] = allMatchesWithSchedule.map((m, idx) => ({
    tournament_id: tournamentId,
    user_uid: userId,
    match_id: createdMatches[idx].id,
    round: m.round,
    bracket_pos: m.bracket_pos,
    source_team1: m.source_team1,
    source_team2: m.source_team2,
  }));

  const { error: tpError } = await supabase
    .from("tournament_playoffs")
    .insert(playoffRows);

  if (tpError) {
    console.error("Error inserting tournament_playoffs:", tpError);
    throw new CloseGroupsError("Failed to create playoff metadata", 500);
  }

  // actualizar torneo, opcional: podrías agregar un flag tipo group_phase_closed
  const { error: upError } = await supabase
    .from("tournaments")
    .update({ status: "in_progress" }) // sigue en progreso pero grupos cerrados
    .eq("id", tournamentId);

  if (upError) {
    console.error("Error updating tournament:", upError);
    throw new CloseGroupsError("Failed to update tournament", 500);
  }
}
