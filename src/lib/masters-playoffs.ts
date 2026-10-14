import type { SupabaseClient } from "@supabase/supabase-js";
import { assignPlayoffScheduleSlots } from "@/lib/assign-playoff-schedule-to-matches";
import { CloseGroupsError } from "@/lib/close-groups-error";
import {
  buildMastersPlayoffMatches,
  buildMastersStandingsInsertRows,
  mastersQualifiersForGroup,
  projectedMastersPlayoffMatches,
  type MastersQualifier,
} from "@/lib/masters-tournament";
import { slotIntervalMinutesForPlayoffScheduling } from "@/lib/playoff-match-duration";
import {
  buildPlayoffScheduleSlots,
  parseExplicitPlayoffSlots,
  parseScheduleConfigFromBody,
} from "@/lib/playoff-schedule-slots";
import type { PlayoffMatch } from "@/lib/tournament-playoffs";
import type { StandingsMatchInput } from "@/lib/tournament-group-standings";

type GroupRow = { id: number; group_order: number | null };
type GroupTeamRow = { tournament_group_id: number; team_id: number };
type MatchRow = StandingsMatchInput & { status: string };

export async function loadMastersPlayoffBracket(
  supabase: SupabaseClient,
  tournamentId: number
): Promise<
  | {
      ok: true;
      matches: PlayoffMatch[];
      labels: Map<number, string>;
      allGroupMatchesFinished: boolean;
      projectedFromRegistration: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const { data: groups, error: groupsError } = await supabase
    .from("tournament_groups")
    .select("id, group_order")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (groupsError) {
    return { ok: false, error: "No se pudieron leer las zonas", status: 500 };
  }

  if (!groups || groups.length === 0) {
    const { data: teams, error: teamsError } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("is_substitute", false);

    if (teamsError) {
      return { ok: false, error: "No se pudieron leer las parejas", status: 500 };
    }
    if ((teams ?? []).length !== 8) {
      return {
        ok: false,
        error: "Un Master necesita exactamente 8 parejas para el cuadro",
        status: 400,
      };
    }
    return {
      ok: true,
      matches: projectedMastersPlayoffMatches(),
      labels: new Map(),
      allGroupMatchesFinished: false,
      projectedFromRegistration: true,
    };
  }

  const groupRows = groups as GroupRow[];
  if (groupRows.length !== 2) {
    return { ok: false, error: "Un Master tiene 2 zonas", status: 400 };
  }

  const groupIds = groupRows.map((group) => group.id);
  const { data: groupTeams, error: groupTeamsError } = await supabase
    .from("tournament_group_teams")
    .select("tournament_group_id, team_id")
    .in("tournament_group_id", groupIds);

  if (groupTeamsError || !groupTeams) {
    return { ok: false, error: "No se pudieron leer las parejas de zona", status: 500 };
  }

  const { data: matches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_group_id, team1_id, team2_id, team1_sets, team2_sets, team1_games_total, team2_games_total, status, match_order"
    )
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (matchesError || !matches) {
    return { ok: false, error: "No se pudieron leer los partidos de zona", status: 500 };
  }

  const teamRows = groupTeams as GroupTeamRow[];
  const matchRows = matches as MatchRow[];
  const qualifiers: MastersQualifier[] = [];

  for (const group of groupRows) {
    const teamIds = teamRows
      .filter((row) => row.tournament_group_id === group.id)
      .map((row) => row.team_id);
    if (teamIds.length !== 4) {
      return { ok: false, error: "Cada zona de un Master tiene 4 parejas", status: 400 };
    }
    const groupMatches = matchRows.filter((match) => match.tournament_group_id === group.id);
    qualifiers.push(
      ...mastersQualifiersForGroup(
        group.id,
        group.group_order ?? 0,
        teamIds,
        groupMatches
      )
    );
  }

  const allGroupMatchesFinished =
    matchRows.length > 0 && matchRows.every((match) => match.status === "finished");
  const labels = new Map<number, string>();
  for (const qualifier of qualifiers) {
    const letter =
      qualifier.group_order >= 1 && qualifier.group_order <= 26
        ? String.fromCharCode(64 + qualifier.group_order)
        : "?";
    labels.set(qualifier.team_id, `${qualifier.pos}${letter}`);
  }

  return {
    ok: true,
    matches: buildMastersPlayoffMatches(qualifiers, {
      slotLabels: !allGroupMatchesFinished,
    }),
    labels,
    allGroupMatchesFinished,
    projectedFromRegistration: false,
  };
}

export async function runMastersCloseGroups(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: number,
  tournament: {
    match_duration?: number | null;
    match_duration_quarters_onwards?: number | null;
  },
  body: Record<string, unknown>
): Promise<void> {
  const scheduleConfig = parseScheduleConfigFromBody(body);
  const explicitPlayoffSlots = parseExplicitPlayoffSlots(body);

  const { data: groups, error: groupsError } = await supabase
    .from("tournament_groups")
    .select("id, group_order")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (groupsError || !groups || groups.length === 0) {
    throw new CloseGroupsError("No hay zonas en este Master", 400);
  }

  const groupRows = groups as GroupRow[];
  if (groupRows.length !== 2) {
    throw new CloseGroupsError("Un Master tiene 2 zonas", 400);
  }

  const groupIds = groupRows.map((group) => group.id);
  const { data: groupTeams, error: groupTeamsError } = await supabase
    .from("tournament_group_teams")
    .select("tournament_group_id, team_id")
    .in("tournament_group_id", groupIds);

  if (groupTeamsError || !groupTeams) {
    throw new CloseGroupsError("No se pudieron leer las parejas de zona", 500);
  }

  const { data: matches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select(
      "id, tournament_group_id, team1_id, team2_id, team1_sets, team2_sets, team1_games_total, team2_games_total, status, match_order"
    )
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (matchesError || !matches) {
    throw new CloseGroupsError("No se pudieron leer los partidos de zona", 500);
  }

  const teamRows = groupTeams as GroupTeamRow[];
  const matchRows = matches as MatchRow[];

  await supabase.from("tournament_group_standings").delete().in("tournament_group_id", groupIds);

  const standingsInsert: ReturnType<typeof buildMastersStandingsInsertRows> = [];
  const qualifiers: MastersQualifier[] = [];

  for (const group of groupRows) {
    const teamIds = teamRows
      .filter((row) => row.tournament_group_id === group.id)
      .map((row) => row.team_id);
    const groupMatches = matchRows.filter((match) => match.tournament_group_id === group.id);
    standingsInsert.push(
      ...buildMastersStandingsInsertRows(group.id, userId, teamIds, groupMatches)
    );
    qualifiers.push(
      ...mastersQualifiersForGroup(group.id, group.group_order ?? 0, teamIds, groupMatches)
    );
  }

  if (standingsInsert.length > 0) {
    const { error: standingsError } = await supabase
      .from("tournament_group_standings")
      .insert(standingsInsert);
    if (standingsError) {
      console.error("Error inserting masters standings:", standingsError);
      throw new CloseGroupsError("No se pudo guardar la tabla de posiciones", 500);
    }
  }

  const allMatches = buildMastersPlayoffMatches(qualifiers);
  const playoffMin = Math.max(
    15,
    tournament.match_duration_quarters_onwards ?? tournament.match_duration ?? 60
  );
  const playoffSlotInterval = slotIntervalMinutesForPlayoffScheduling(playoffMin);

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

  let allMatchesWithSchedule = allMatches.map((match) => ({
    ...match,
    match_date: null as string | null,
    start_time: null as string | null,
    end_time: null as string | null,
    court_id: null as number | null,
  }));

  if (scheduleSlots && scheduleSlots.length > 0) {
    try {
      allMatchesWithSchedule = assignPlayoffScheduleSlots(allMatches, scheduleSlots, playoffMin);
    } catch (error) {
      throw new CloseGroupsError(
        error instanceof Error ? error.message : "Error al asignar horarios",
        400
      );
    }
  }

  const playoffMatchesPayload = allMatchesWithSchedule.map((match) => ({
    tournament_id: tournamentId,
    user_uid: userId,
    phase: "playoff",
    tournament_group_id: null,
    team1_id: match.team1_id,
    team2_id: match.team2_id,
    status: "scheduled",
    match_date: match.match_date || null,
    start_time: match.start_time || null,
    end_time: match.end_time || null,
    court_id: match.court_id || null,
  }));

  const { data: createdMatches, error: createMatchesError } = await supabase
    .from("tournament_matches")
    .insert(playoffMatchesPayload)
    .select("id");

  if (createMatchesError || !createdMatches) {
    console.error("Error creating masters playoff matches:", createMatchesError);
    throw new CloseGroupsError("No se pudieron crear los partidos de playoff", 500);
  }

  const playoffRows = allMatchesWithSchedule.map((match, index) => ({
    tournament_id: tournamentId,
    user_uid: userId,
    match_id: createdMatches[index].id,
    round: match.round,
    bracket_pos: match.bracket_pos,
    source_team1: match.source_team1,
    source_team2: match.source_team2,
  }));

  const { error: playoffRowsError } = await supabase.from("tournament_playoffs").insert(playoffRows);
  if (playoffRowsError) {
    console.error("Error inserting masters playoff rows:", playoffRowsError);
    throw new CloseGroupsError("No se pudo crear el cuadro", 500);
  }

  const { error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "in_progress" })
    .eq("id", tournamentId);

  if (updateError) {
    console.error("Error updating masters tournament:", updateError);
    throw new CloseGroupsError("No se pudo actualizar el torneo", 500);
  }
}
