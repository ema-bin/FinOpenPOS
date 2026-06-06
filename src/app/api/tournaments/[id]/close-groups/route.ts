export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlayoffs } from "@/lib/tournament-playoffs";

type RouteParams = { params: { id: string } };

import type { ScheduleDay, ScheduleConfig, SchedulePhysicalSlotCourtSelection } from "@/models/dto/tournament";

function parsePlayoffScheduleSelections(
  body: Record<string, unknown>
): SchedulePhysicalSlotCourtSelection[] {
  const raw = body.selectedPhysicalSlots;
  if (!Array.isArray(raw)) return [];
  const out: SchedulePhysicalSlotCourtSelection[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const slotId = Number(r.tournamentGroupSlotId ?? r.slotId);
    const courtId = Number(r.courtId);
    const slotDate = String(r.slotDate ?? "").trim().slice(0, 10);
    const startTime = String(r.startTime ?? "").trim().slice(0, 5);
    const endTime = String(r.endTime ?? "").trim().slice(0, 5);
    if (!Number.isFinite(courtId) || courtId <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) continue;
    if (!startTime || !endTime) continue;
    const hasSlotId = Number.isFinite(slotId) && slotId > 0;
    out.push({
      tournamentGroupSlotId: hasSlotId ? slotId : undefined,
      courtId,
      slotDate,
      startTime,
      endTime,
    });
  }
  return out;
}
// Función helper para generar slots de tiempo
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

      // Agregar un slot por cada cancha disponible
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

import type { TournamentMatch } from "@/models/db/tournament";
import {
  playoffMatchDurationMinutes,
  slotIntervalMinutesForPlayoffScheduling,
} from "@/lib/playoff-match-duration";
import { expandPhysicalWindowsToPlayoffSlotList } from "@/lib/playoff-expand-selected-slots";

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

export async function POST(req: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournamentId = Number(params.id);
  if (Number.isNaN(tournamentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Obtener configuración de horarios del body (grilla legacy o slots del torneo × cancha)
  const bodyRaw = await req.json().catch(() => ({}));
  const body = typeof bodyRaw === "object" && bodyRaw !== null ? (bodyRaw as Record<string, unknown>) : {};
  const selectedPhysicalSlotsFromBody = parsePlayoffScheduleSelections(body);
  const hasPhysicalScheduling = selectedPhysicalSlotsFromBody.length > 0;

  const bodyDaysUnknown = body.days as unknown;
  const hasLegacyDaysGrid =
    Array.isArray(bodyDaysUnknown) &&
    bodyDaysUnknown.length > 0 &&
    bodyDaysUnknown.every(
      (d: unknown) =>
        d !== null &&
        typeof d === "object" &&
        typeof (d as { date?: unknown }).date === "string" &&
        String((d as { date?: string }).date!).trim().length >= 10
    );

  let scheduleConfig: ScheduleConfig | undefined;
  if (hasPhysicalScheduling) {
    const courtIdsParsed = Array.isArray(body.courtIds)
      ? (body.courtIds as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const courtIdsFromSelections: number[] = [];
    if (courtIdsParsed.length === 0) {
      const seen = new Map<number, true>();
      for (const row of selectedPhysicalSlotsFromBody) {
        if (seen.has(row.courtId)) continue;
        seen.set(row.courtId, true);
        courtIdsFromSelections.push(row.courtId);
      }
    }
    scheduleConfig = {
      days: [],
      matchDuration: Number(body.matchDuration) || 60,
      courtIds:
        courtIdsParsed.length > 0 ? courtIdsParsed : courtIdsFromSelections,
      selectedPhysicalSlots: selectedPhysicalSlotsFromBody,
    };
  } else if (hasLegacyDaysGrid) {
    scheduleConfig = {
      days: body.days as ScheduleDay[],
      matchDuration: Number(body.matchDuration) || 60,
      courtIds: Array.isArray(body.courtIds) ? (body.courtIds as number[]) : [],
    };
  }

  // 1) torneo
  const { data: t, error: terr } = await supabase
    .from("tournaments")
    .select("id, status, user_uid, match_duration, match_duration_quarters_onwards")
    .eq("id", tournamentId)
    .single();

  if (terr || !t) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  if (t.status !== "playoffs_ready" && t.status !== "in_progress") {
    return NextResponse.json(
      { error: "El torneo debe estar listo para playoffs o en progreso para generar la llave" },
      { status: 400 }
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
    return NextResponse.json(
      { error: "Failed to check existing playoffs" },
      { status: 500 }
    );
  }

  if (existingPlayoffs && existingPlayoffs.length > 0) {
    return NextResponse.json(
      { error: "Playoffs already generated for this tournament" },
      { status: 400 }
    );
  }

  // 2) grupos
  const { data: groups, error: gError } = await supabase
    .from("tournament_groups")
    .select("id, name")
    .eq("tournament_id", tournamentId)
    .order("group_order", { ascending: true });

  if (gError || !groups || groups.length === 0) {
    return NextResponse.json({ error: "No groups found" }, { status: 400 });
  }

  const groupIds = groups.map((g) => g.id);

  // 3) group_teams -> para saber tamaño de cada grupo
  const { data: groupTeams, error: gtError } = await supabase
    .from("tournament_group_teams")
    .select("tournament_group_id, team_id")
    .in("tournament_group_id", groupIds);

  if (gtError || !groupTeams) {
    console.error("Error fetching group_teams:", gtError);
    return NextResponse.json(
      { error: "Failed to fetch group teams" },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }

  // 5) calcular standings por grupo
  type Stand = {
    team_id: number;
    matches_played: number;
    wins: number;
    losses: number;
    sets_won: number;
    sets_lost: number;
    games_won: number;
    games_lost: number;
  };

  const standingsMap = new Map<number, Map<number, Stand>>();
  // group_id -> (team_id -> stat)

  const initStand = (teamId: number): Stand => ({
    team_id: teamId,
    matches_played: 0,
    wins: 0,
    losses: 0,
    sets_won: 0,
    sets_lost: 0,
    games_won: 0,
    games_lost: 0,
  });

  for (const m of matches as MatchRow[]) {
    if (m.status !== "finished") {
      continue;
    }
    const gid = m.tournament_group_id;
    if (!gid) continue;

    if (!standingsMap.has(gid)) {
      standingsMap.set(gid, new Map());
    }
    const gidNum = gid ?? 0;
    if (gidNum === 0) continue;
    const map = standingsMap.get(gidNum)!;

    if (m.team1_id && !map.has(m.team1_id)) map.set(m.team1_id, initStand(m.team1_id));
    if (m.team2_id && !map.has(m.team2_id)) map.set(m.team2_id, initStand(m.team2_id));

    if (!m.team1_id || !m.team2_id) continue;

    const s1 = map.get(m.team1_id)!;
    const s2 = map.get(m.team2_id)!;

    s1.matches_played += 1;
    s2.matches_played += 1;

    const t1sets = m.team1_sets ?? 0;
    const t2sets = m.team2_sets ?? 0;
    const t1games = m.team1_games_total ?? 0;
    const t2games = m.team2_games_total ?? 0;

    s1.sets_won += t1sets;
    s1.sets_lost += t2sets;
    s2.sets_won += t2sets;
    s2.sets_lost += t1sets;

    s1.games_won += t1games;
    s1.games_lost += t2games;
    s2.games_won += t2games;
    s2.games_lost += t1games;

    if (t1sets > t2sets) {
      s1.wins += 1;
      s2.losses += 1;
    } else if (t2sets > t1sets) {
      s2.wins += 1;
      s1.losses += 1;
    }
  }

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
    const map = standingsMap.get(gid) ?? new Map<number, Stand>();

    const groupTeamIds = groupTeams
      .filter((gt) => gt.tournament_group_id === gid)
      .map((gt) => gt.team_id);

    const stats: Stand[] = groupTeamIds.map(
      (tid) => map.get(tid) ?? initStand(tid)
    );

    // En zonas de 4, el orden final lo define la 2da ronda:
    // - match_order 3 (ganadores): ganador=1°, perdedor=2°
    // - match_order 4 (perdedores): ganador=3°, perdedor=4°
    // Si aún no están completos, cae al criterio general.
    let forcedPositionByTeamId: Map<number, number> | null = null;
    if (groupTeamIds.length === 4) {
      const groupMatches = (matches as MatchRow[]).filter(
        (m) => m.tournament_group_id === gid
      );
      const winnersMatch = groupMatches.find((m) => m.match_order === 3);
      const losersMatch = groupMatches.find((m) => m.match_order === 4);
      const canForceOrder =
        winnersMatch &&
        losersMatch &&
        winnersMatch.status === "finished" &&
        losersMatch.status === "finished" &&
        winnersMatch.team1_id &&
        winnersMatch.team2_id &&
        losersMatch.team1_id &&
        losersMatch.team2_id;

      if (canForceOrder) {
        const winnerOfWinners =
          (winnersMatch!.team1_sets ?? 0) > (winnersMatch!.team2_sets ?? 0)
            ? winnersMatch!.team1_id!
            : winnersMatch!.team2_id!;
        const loserOfWinners =
          (winnersMatch!.team1_sets ?? 0) > (winnersMatch!.team2_sets ?? 0)
            ? winnersMatch!.team2_id!
            : winnersMatch!.team1_id!;
        const winnerOfLosers =
          (losersMatch!.team1_sets ?? 0) > (losersMatch!.team2_sets ?? 0)
            ? losersMatch!.team1_id!
            : losersMatch!.team2_id!;
        const loserOfLosers =
          (losersMatch!.team1_sets ?? 0) > (losersMatch!.team2_sets ?? 0)
            ? losersMatch!.team2_id!
            : losersMatch!.team1_id!;

        forcedPositionByTeamId = new Map<number, number>([
          [winnerOfWinners, 1],
          [loserOfWinners, 2],
          [winnerOfLosers, 3],
          [loserOfLosers, 4],
        ]);
      }
    }

    stats.sort((a, b) => {
      if (forcedPositionByTeamId) {
        const pA = forcedPositionByTeamId.get(a.team_id) ?? 999;
        const pB = forcedPositionByTeamId.get(b.team_id) ?? 999;
        if (pA !== pB) return pA - pB;
      }
      // Criterio general: wins, diff sets, diff games
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aSetDiff = a.sets_won - a.sets_lost;
      const bSetDiff = b.sets_won - b.sets_lost;
      if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;
      const aGameDiff = a.games_won - a.games_lost;
      const bGameDiff = b.games_won - b.games_lost;
      return bGameDiff - aGameDiff;
    });

    // insertar standings con posición
    stats.forEach((s, index) =>
      standingsInsert.push({
        tournament_group_id: gid,
        team_id: s.team_id,
        user_uid: user.id,
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
    const size = groupTeamIds.length;
    let qualifiersCount = 2; // Por defecto: zonas de 3 equipos
    if (size === 4) qualifiersCount = 3; // Zonas de 4 equipos: pasan 3

    stats.slice(0, qualifiersCount).forEach((s, index) => {
      qualifiedTeams.push({
        team_id: s.team_id,
        from_group_id: gid,
        pos: index + 1,
      });
    });
  }

  if (standingsInsert.length > 0) {
    const { error: siError } = await supabase
      .from("tournament_group_standings")
      .insert(standingsInsert);
    if (siError) {
      console.error("Error inserting standings:", siError);
      return NextResponse.json(
        { error: "Failed to save standings" },
        { status: 500 }
      );
    }
  }

  // 7) generar playoffs: bracket completo con todas las rondas
  if (qualifiedTeams.length < 2) {
    return NextResponse.json(
      { error: "Not enough qualified teams for playoffs" },
      { status: 400 }
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
    return NextResponse.json(
      { error: "Failed to fetch groups order" },
      { status: 500 }
    );
  }

  // Crear mapa de group_id -> group_order
  const groupOrderMap = new Map<number, number>();
  groupsOrdered.forEach((g) => {
    groupOrderMap.set(g.id, g.group_order);
  });

  const totalPairs = groupTeams?.length ?? 0;
  const allMatches = generatePlayoffs(qualifiedTeams, groupOrderMap, totalPairs);

  // Agregar campos de horarios a los matches
  const allMatchesWithSchedule = allMatches.map(m => ({
    ...m,
    match_date: undefined as string | null | undefined,
    start_time: undefined as string | null | undefined,
    end_time: undefined as string | null | undefined,
    court_id: undefined as number | null | undefined,
  }));

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

  let scheduleSlots: Array<{ date: string; startTime: string; court_id: number }> | null = null;

  if (usePhysicalSelections && scheduleConfig?.selectedPhysicalSlots?.length) {
    scheduleSlots = expandPhysicalWindowsToPlayoffSlotList(
      scheduleConfig.selectedPhysicalSlots,
      playoffMin
    );
    if (scheduleSlots.length === 0) {
      return NextResponse.json(
        {
          error:
            "Las ventanas elegidas no generan ningún hueco valido para partidos de playoff (revisa la duracion de eliminatoria y los horarios del torneo).",
        },
        { status: 400 }
      );
    }
  } else if (useLegacyDaysGrid && scheduleConfig) {
    const raw = generateTimeSlots(
      scheduleConfig.days,
      playoffSlotInterval,
      scheduleConfig.courtIds.length
    );
    scheduleSlots = raw.map((s, idx) => ({
      date: s.date,
      startTime: s.startTime,
      court_id: scheduleConfig!.courtIds[idx % scheduleConfig!.courtIds.length]!,
    }));
  }

  if (scheduleSlots && scheduleSlots.length > 0) {
    const matchesNeedingSchedule = allMatchesWithSchedule.filter((m) => {
      if (m.team1_id && m.team2_id) return true;
      if (m.source_team1 || m.source_team2) return true;
      return false;
    });

    if (scheduleSlots.length < matchesNeedingSchedule.length) {
      return NextResponse.json(
        {
          error: `No hay suficientes slots disponibles. Se necesitan ${matchesNeedingSchedule.length} slots pero solo hay ${scheduleSlots.length} disponibles.`,
        },
        { status: 400 }
      );
    }

    const calculateEndTimeFromStart = (startTime: string): string => {
      const dur = playoffMatchDurationMinutes(playoffMin);
      const [startH, startM] = startTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = startMinutes + dur;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    };

    const matchIndices = allMatchesWithSchedule.map((_, index) => index);
    matchIndices.sort((a, b) => {
      const matchA = allMatchesWithSchedule[a];
      const matchB = allMatchesWithSchedule[b];
      const roundOrder: Record<string, number> = {
        "16avos": 1,
        "octavos": 2,
        "cuartos": 3,
        "semifinal": 4,
        "final": 5,
      };
      const aOrder = roundOrder[matchA.round] || 999;
      const bOrder = roundOrder[matchB.round] || 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return matchA.bracket_pos - matchB.bracket_pos;
    });

    let slotIndex = 0;
    matchIndices.forEach((originalIndex) => {
      const match = allMatchesWithSchedule[originalIndex];
      const needsSchedule =
        Boolean(match.team1_id && match.team2_id) ||
        Boolean(match.source_team1 || match.source_team2);

      if (needsSchedule && slotIndex < scheduleSlots!.length) {
        const slot = scheduleSlots![slotIndex];
        match.match_date = slot.date;
        match.start_time = slot.startTime;
        match.end_time = calculateEndTimeFromStart(slot.startTime);
        match.court_id = slot.court_id;
        slotIndex++;
      }
    });
  }

  // Insertar todos los partidos en la base de datos
  const playoffMatchesPayload: any[] = allMatchesWithSchedule.map((m: any) => ({
    tournament_id: tournamentId,
    user_uid: user.id,
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
    return NextResponse.json(
      { error: "Failed to create playoff matches" },
      { status: 500 }
    );
  }

  // Crear las filas de tournament_playoffs con referencias correctas
  const playoffRows: any[] = allMatchesWithSchedule.map((m, idx) => ({
    tournament_id: tournamentId,
    user_uid: user.id,
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
    return NextResponse.json(
      { error: "Failed to create playoff metadata" },
      { status: 500 }
    );
  }

  // actualizar torneo, opcional: podrías agregar un flag tipo group_phase_closed
  const { error: upError } = await supabase
    .from("tournaments")
    .update({ status: "in_progress" }) // sigue en progreso pero grupos cerrados
    .eq("id", tournamentId);

  if (upError) {
    console.error("Error updating tournament:", upError);
    return NextResponse.json(
      { error: "Failed to update tournament" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
