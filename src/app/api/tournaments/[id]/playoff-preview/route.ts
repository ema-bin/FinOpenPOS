export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildProjectedQualifiedTeams,
  computeGroupSizes,
} from "@/lib/tournament-group-sizes";
import { generatePlayoffs, type PlayoffMatch } from "@/lib/tournament-playoffs";
import { computeQualifiedTeamsFromStandings } from "@/lib/tournament-group-standings";
import type { ScheduleConfig, ScheduleDay } from "@/models/dto/tournament";
import type { TournamentMatch } from "@/models/db/tournament";

type RouteParams = { params: { id: string } };

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

type PlayoffPreviewMatch = PlayoffMatch & {
  match_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  court_id?: number | null;
  /** Etiqueta de slot para preview (1A, 2B, …), siempre como al inicio */
  display_team1?: string | null;
  display_team2?: string | null;
};

type PreviewResponse = {
  matches: PlayoffPreviewMatch[];
  slotsNeeded: number;
  slotsAvailable: number;
  placeholdersUsed: boolean;
  projectedFromRegistration: boolean;
};

function generateTimeSlots(
  days: ScheduleDay[],
  matchDuration: number,
  numCourts: number
): Array<{ date: string; startTime: string; endTime: string }> {
  const slots: Array<{ date: string; startTime: string; endTime: string }> = [];

  days.forEach((day) => {
    const [startH, startM] = day.startTime.split(":").map(Number);
    const [endH, endM] = day.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    let currentMinutes = startMinutes;
    while (currentMinutes + matchDuration <= endMinutes) {
      const slotStartH = Math.floor(currentMinutes / 60);
      const slotStartM = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + matchDuration;
      const slotEndH = Math.floor(slotEndMinutes / 60);
      const slotEndM = slotEndMinutes % 60;

      for (let i = 0; i < numCourts; i++) {
        slots.push({
          date: day.date,
          startTime: `${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}`,
          endTime: `${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}`,
        });
      }

      currentMinutes += matchDuration;
    }
  });

  return slots;
}

function applyPlaceholders(
  matches: PlayoffPreviewMatch[],
  placeholderMap: Map<number, string>,
  disableTeams: boolean
) {
  if (!disableTeams) return null;

  const roundOrder: Record<string, number> = {
    "16avos": 1,
    "octavos": 2,
    "cuartos": 3,
    "semifinal": 4,
    "final": 5,
  };

  const minRoundValue = matches.reduce((minValue, match) => {
    const value = roundOrder[match.round] ?? 999;
    return Math.min(minValue, value);
  }, Infinity);

  matches
    .filter((match) => (roundOrder[match.round] ?? 999) === minRoundValue)
    .forEach((match) => {
      if (match.team1_id) {
        match.source_team1 = placeholderMap.get(match.team1_id) ?? match.source_team1;
        match.team1_id = null;
      }
      if (match.team2_id) {
        match.source_team2 = placeholderMap.get(match.team2_id) ?? match.source_team2;
        match.team2_id = null;
      }
    });

  return minRoundValue;
}

function assignTimeSlots(
  matches: PlayoffPreviewMatch[],
  scheduleConfig?: ScheduleConfig
): { slotsNeeded: number; slotsAvailable: number } {
  if (!scheduleConfig || scheduleConfig.days.length === 0 || scheduleConfig.courtIds.length === 0) {
    return { slotsNeeded: 0, slotsAvailable: 0 };
  }

  const timeSlots = generateTimeSlots(
    scheduleConfig.days,
    scheduleConfig.matchDuration,
    scheduleConfig.courtIds.length
  );

  const matchIndices = matches.map((_, index) => index);
  matchIndices.sort((a, b) => {
    const roundOrder: Record<string, number> = {
      "16avos": 1,
      "octavos": 2,
      "cuartos": 3,
      "semifinal": 4,
      "final": 5,
    };
    const matchA = matches[a];
    const matchB = matches[b];
    const aOrder = roundOrder[matchA.round] ?? 999;
    const bOrder = roundOrder[matchB.round] ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (matchA.bracket_pos ?? 0) - (matchB.bracket_pos ?? 0);
  });

  let slotIndex = 0;
  let slotsNeeded = 0;

  matchIndices.forEach((originalIndex) => {
    const match = matches[originalIndex];
    const needsSchedule =
      (match.team1_id && match.team2_id) ||
      Boolean(match.source_team1) ||
      Boolean(match.source_team2);
    if (!needsSchedule) return;
    slotsNeeded += 1;
    if (slotIndex >= timeSlots.length) {
      throw new Error(`No hay suficientes slots disponibles. Se necesitan al menos ${slotsNeeded} slots.`);
    }
    const slot = timeSlots[slotIndex];
    match.match_date = slot.date;
    match.start_time = slot.startTime;
    match.end_time = slot.endTime;
    const courtIndex = slotIndex % scheduleConfig.courtIds.length;
    match.court_id = scheduleConfig.courtIds[courtIndex];
    slotIndex += 1;
  });

  return { slotsNeeded, slotsAvailable: timeSlots.length };
}

export async function POST(req: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tournamentId = Number(params.id);
  if (Number.isNaN(tournamentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const scheduleConfig: ScheduleConfig | undefined = body.days
    ? {
        days: body.days,
        matchDuration: body.matchDuration || 60,
        courtIds: body.courtIds || [],
      }
    : undefined;

  const { data: groups, error: groupsError } = await supabase
    .from("tournament_groups")
    .select("id, group_order")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (groupsError) {
    console.error("Error fetching groups:", groupsError);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }

  let qualified: Array<{ team_id: number; from_group_id: number; pos: number }>;
  let placeholderMap: Map<number, string>;
  let groupOrderMap: Map<number, number>;
  let totalPairs: number;
  let allGroupMatchesFinished: boolean;
  let projectedFromRegistration: boolean;

  if (!groups || groups.length === 0) {
    const { data: teams, error: teamsError } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("is_substitute", false);

    if (teamsError || !teams) {
      console.error("Error fetching teams:", teamsError);
      return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
    }

    if (teams.length < 3) {
      return NextResponse.json(
        { error: "Se necesitan al menos 3 equipos inscriptos para previsualizar playoffs" },
        { status: 400 }
      );
    }

    const groupSizes = computeGroupSizes(teams.length);
    const projected = buildProjectedQualifiedTeams(groupSizes);
    qualified = projected.qualified;
    placeholderMap = projected.placeholderMap;
    groupOrderMap = projected.groupOrderMap;
    totalPairs = projected.totalPairs;
    allGroupMatchesFinished = false;
    projectedFromRegistration = true;
  } else {
    const groupIds = groups.map((g) => g.id);

    const { data: groupTeams, error: groupTeamsError } = await supabase
      .from("tournament_group_teams")
      .select("tournament_group_id, team_id")
      .in("tournament_group_id", groupIds);

    if (groupTeamsError || !groupTeams) {
      console.error("Error fetching group teams:", groupTeamsError);
      return NextResponse.json({ error: "Failed to fetch group teams" }, { status: 500 });
    }

    const { data: matches, error: matchesError } = await supabase
      .from("tournament_matches")
      .select(
        "id, tournament_group_id, team1_id, team2_id, team1_sets, team2_sets, team1_games_total, team2_games_total, status, match_order"
      )
      .eq("tournament_id", tournamentId)
      .eq("phase", "group");

    if (matchesError || !matches) {
      console.error("Error fetching matches:", matchesError);
      return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
    }

    ({ qualified, placeholderMap } = computeQualifiedTeamsFromStandings({
      groups,
      groupTeams,
      matches: matches as MatchRow[],
    }));

    if (qualified.length < 2) {
      return NextResponse.json({ error: "Not enough qualified teams for playoffs" }, { status: 400 });
    }

    groupOrderMap = new Map<number, number>();
    groups.forEach((group) => {
      groupOrderMap.set(group.id, group.group_order ?? 999);
    });

    totalPairs = groupTeams.length;
    allGroupMatchesFinished = matches.every((m) => m.status === "finished");
    projectedFromRegistration = false;
  }

  if (qualified.length < 2) {
    return NextResponse.json({ error: "Not enough qualified teams for playoffs" }, { status: 400 });
  }

  const allMatches = generatePlayoffs(qualified, groupOrderMap, totalPairs);

  const teamIdToLabel = new Map<number, string>();
  qualified.forEach((q) => {
    const groupOrder = groupOrderMap.get(q.from_group_id) ?? 999;
    const letter = groupOrder >= 1 && groupOrder <= 26 ? String.fromCharCode(64 + groupOrder) : "?";
    teamIdToLabel.set(q.team_id, `${q.pos}${letter}`);
  });

  const allMatchesWithSchedule = allMatches.map((match) => ({
    ...match,
    match_date: null,
    start_time: null,
    end_time: null,
    court_id: null,
    display_team1: match.team1_id ? (teamIdToLabel.get(match.team1_id) ?? null) : null,
    display_team2: match.team2_id ? (teamIdToLabel.get(match.team2_id) ?? null) : null,
  })) as PlayoffPreviewMatch[];

  const minRoundValue = applyPlaceholders(
    allMatchesWithSchedule,
    placeholderMap,
    !allGroupMatchesFinished
  );

  if (minRoundValue !== null) {
    const roundOrder: Record<string, number> = {
      "16avos": 1,
      "octavos": 2,
      "cuartos": 3,
      "semifinal": 4,
      "final": 5,
    };
    allMatchesWithSchedule.forEach((match) => {
      const value = roundOrder[match.round] ?? 999;
      if (value > minRoundValue) {
        match.team1_id = null;
        match.source_team1 = null;
        match.display_team1 = null;
      }
      if (value > minRoundValue) {
        match.team2_id = null;
        match.source_team2 = null;
        match.display_team2 = null;
      }
    });
  }

  let slotsNeeded = 0;
  let slotsAvailable = 0;
  try {
    const slotInfo = assignTimeSlots(allMatchesWithSchedule, scheduleConfig);
    slotsNeeded = slotInfo.slotsNeeded;
    slotsAvailable = slotInfo.slotsAvailable;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error assigning slots" }, { status: 400 });
  }

  const response: PreviewResponse = {
    matches: allMatchesWithSchedule,
    slotsNeeded,
    slotsAvailable,
    placeholdersUsed: !allGroupMatchesFinished,
    projectedFromRegistration,
  };

  return NextResponse.json(response);
}
