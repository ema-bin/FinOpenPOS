export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scheduleGroupMatches } from "@/lib/tournament-scheduler";
import type { ScheduleConfig } from "@/models/dto/tournament";

type RouteParams = { params: { id: string } };

function normalizeTimeHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.substring(0, 5);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  const safeHours = Number.isNaN(hours) ? 0 : hours;
  const safeMinutes = Number.isNaN(minutes) ? 0 : minutes;
  if (safeHours === 0 && safeMinutes === 0) return 24 * 60;
  return safeHours * 60 + safeMinutes;
}

function rangesOverlap(
  slotStart: string,
  slotEnd: string,
  matchStart: string,
  matchEnd: string
): boolean {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);
  const matchStartMin = timeToMinutes(matchStart);
  const matchEndMin = timeToMinutes(matchEnd);
  return slotStartMin < matchEndMin && slotEndMin > matchStartMin;
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

  // Obtener configuración de horarios del body
  const body = await req.json().catch(() => ({}));
  const overlapTournamentIds = Array.isArray(body.overlapTournamentIds)
    ? Array.from(
        new Set(
          body.overlapTournamentIds
            .map((value: unknown) => Number(value))
            .filter(
              (value: number) =>
                Number.isFinite(value) && value > 0 && value !== tournamentId
            )
        )
      )
    : [];
  const scheduleConfig: ScheduleConfig | undefined = body.days
    ? {
        days: body.days,
        matchDuration: body.matchDuration || 60,
        courtIds: body.courtIds || [],
      }
    : undefined;

  if (!scheduleConfig || !scheduleConfig.days.length || !scheduleConfig.courtIds.length) {
    return NextResponse.json(
      { error: "Configuración de horarios inválida" },
      { status: 400 }
    );
  }

  // 1) Verificar que el torneo existe y pertenece al usuario
  const { data: t, error: terr } = await supabase
    .from("tournaments")
    .select("id, status, user_uid, match_duration")
    .eq("id", tournamentId)
    .single();

  if (terr || !t) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const involvedTournamentIds = Array.from(
    new Set([tournamentId, ...overlapTournamentIds])
  );

  // 2) Obtener todos los partidos de fase de grupos sin resultados
  // Un partido sin resultados es aquel donde set1_team1_games es null
  const { data: matches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select("id, tournament_id, tournament_group_id, team1_id, team2_id, match_order, status, set1_team1_games, court_id")
    .in("tournament_id", involvedTournamentIds)
    .eq("phase", "group")
    .is("set1_team1_games", null); // Solo partidos sin resultados

  if (matchesError) {
    console.error("Error fetching matches:", matchesError);
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }

  if (!matches || matches.length === 0) {
    // Verificar si hay partidos con resultados para dar un mensaje más específico
    const { data: allMatches } = await supabase
      .from("tournament_matches")
      .select("id")
      .in("tournament_id", involvedTournamentIds)
      .eq("phase", "group");
    
    if (allMatches && allMatches.length > 0) {
      return NextResponse.json(
        { error: "Todos los partidos de fase de grupos ya tienen resultados cargados en los torneos seleccionados. Solo se pueden regenerar horarios de partidos sin resultados." },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "No hay partidos de fase de grupos sin resultados" },
      { status: 400 }
    );
  }

  // 3) Limpiar horarios de todos los partidos de fase de grupos (sin resultados)
  const { error: clearError } = await supabase
    .from("tournament_matches")
    .update({
      match_date: null,
      start_time: null,
      end_time: null,
      court_id: null,
    })
    .in("tournament_id", involvedTournamentIds)
    .eq("phase", "group")
    .is("set1_team1_games", null); // Solo partidos sin resultados

  if (clearError) {
    console.error("Error clearing previous schedules:", clearError);
    return NextResponse.json(
      { error: `Error al limpiar horarios previos: ${clearError.message}` },
      { status: 500 }
    );
  }

  // 4) Verificar que las canchas seleccionadas existan y pertenezcan al usuario
  const { data: courts, error: courtsError } = await supabase
    .from("courts")
    .select("id")
    .in("id", scheduleConfig.courtIds)
    .eq("is_active", true);

  if (courtsError) {
    console.error("Error fetching courts:", courtsError);
    return NextResponse.json(
      { error: "Failed to fetch courts" },
      { status: 500 }
    );
  }

  if (!courts || courts.length === 0) {
    return NextResponse.json(
      { error: "Las canchas seleccionadas no son válidas o no están activas" },
      { status: 400 }
    );
  }

  if (courts.length !== scheduleConfig.courtIds.length) {
    return NextResponse.json(
      { error: "Algunas canchas seleccionadas no son válidas" },
      { status: 400 }
    );
  }

  // 5) Preparar payload para el scheduler
  // Incluir TODOS los partidos, incluso los que tienen equipos null (rondas de ganadores/perdedores en grupos de 4)
  // El scheduler puede programar partidos con equipos null, respetando las restricciones de orden
  const matchesPayload = matches.map((match) => ({
    tournament_id: match.tournament_id,
    user_uid: user.id,
    phase: "group" as const,
    tournament_group_id: match.tournament_group_id,
    team1_id: match.team1_id,
    team2_id: match.team2_id,
    match_date: null,
    start_time: null,
    end_time: null,
    match_order: match.match_order ?? undefined,
  }));

  if (matchesPayload.length === 0) {
    return NextResponse.json(
      {
        error: "No hay partidos de fase de grupos para programar",
      },
      { status: 400 }
    );
  }

  const useRestrictions = body.algorithm === "with-restrictions";
  let teamRestrictions: Map<number, Array<{ date: string; start_time: string; end_time: string }>> | undefined;
  let tournamentSlots: Array<{ id: number; slot_date: string; start_time: string; end_time: string }> | undefined;
  let teamCannotPlaySlotIds: Map<number, Set<number>> | undefined;
  let blockedCourtIdsByTournamentSlotId: Map<number, Set<number>> | undefined;
  let teamDisplayNames: Map<number, string> | undefined;
  let groupDisplayNames: Map<number, string> | undefined;

  const groupIds = Array.from(new Set(matches.map((m) => m.tournament_group_id)));
  const { data: groupsData } = await supabase
    .from("tournament_groups")
    .select("id, name")
    .in("id", groupIds);
  groupDisplayNames = new Map();
  (groupsData ?? []).forEach((row: { id: number; name?: string | null }) => {
    groupDisplayNames!.set(row.id, row.name?.trim() || `Grupo ${row.id}`);
  });

  if (useRestrictions) {
    const { data: allTournamentSlots, error: slotsError } = await supabase
      .from("tournament_group_slots")
      .select("id, slot_date, start_time, end_time")
      .eq("tournament_id", tournamentId)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (slotsError || !allTournamentSlots?.length) {
      return NextResponse.json(
        { error: "No hay slots del torneo. Generá los horarios en Equipos → Generar horarios y usá el mismo conjunto para restricciones." },
        { status: 400 }
      );
    }

    tournamentSlots = allTournamentSlots as Array<{ id: number; slot_date: string; start_time: string; end_time: string }>;

    const teamIds = Array.from(new Set(matches.flatMap((m) => [m.team1_id, m.team2_id]).filter((id): id is number => id !== null)));
    const { data: restrictions, error: restrictionsError } = await supabase
      .from("tournament_team_schedule_restrictions")
      .select("tournament_team_id, tournament_group_slot_id, can_play")
      .in("tournament_team_id", teamIds.length > 0 ? teamIds : [-1]);

    teamCannotPlaySlotIds = new Map();
    if (restrictionsError) {
      return NextResponse.json(
        { error: `Error al cargar restricciones de equipos: ${restrictionsError.message}` },
        { status: 500 }
      );
    }

    const cannotPlayRows = (restrictions ?? []).filter(
      (r: { can_play?: boolean }) => r.can_play === false
    ) as Array<{ tournament_team_id: number; tournament_group_slot_id: number }>;

    if (cannotPlayRows.length > 0) {
      const restrictionSlotIds = Array.from(
        new Set(cannotPlayRows.map((r) => r.tournament_group_slot_id))
      );
      const { data: restrictionSlots, error: restrictionSlotsError } = await supabase
        .from("tournament_group_slots")
        .select("id, slot_date, start_time, end_time")
        .in("id", restrictionSlotIds);

      if (restrictionSlotsError) {
        return NextResponse.json(
          { error: `Error al cargar slots de restricciones: ${restrictionSlotsError.message}` },
          { status: 500 }
        );
      }

      const allTournamentSlotsSafe = tournamentSlots ?? [];
      const restrictionSlotMap = new Map(
        (restrictionSlots ?? []).map(
          (slot: { id: number; slot_date: string; start_time: string; end_time: string }) => [
            slot.id,
            slot,
          ]
        )
      );
      const cannotPlayWindowsByTeam = new Map<
        number,
        Array<{ slot_date: string; start_time: string; end_time: string }>
      >();
      for (const row of cannotPlayRows) {
        const slotData = restrictionSlotMap.get(row.tournament_group_slot_id);
        if (!slotData) continue;
        if (!cannotPlayWindowsByTeam.has(row.tournament_team_id)) {
          cannotPlayWindowsByTeam.set(row.tournament_team_id, []);
        }
        cannotPlayWindowsByTeam.get(row.tournament_team_id)!.push(slotData);
      }

      for (const [teamId, windows] of cannotPlayWindowsByTeam.entries()) {
        const cannotPlaySelectedSlots = new Set<number>();
        for (const selectedSlot of allTournamentSlotsSafe) {
          const selectedDate = String(selectedSlot.slot_date).trim().slice(0, 10);
          const selectedStart = normalizeTimeHHMM(selectedSlot.start_time);
          const selectedEnd = normalizeTimeHHMM(selectedSlot.end_time);
          if (!selectedStart || !selectedEnd) continue;

          const conflicts = windows.some((window) => {
            const windowDate = String(window.slot_date).trim().slice(0, 10);
            if (windowDate !== selectedDate) return false;
            const windowStart = normalizeTimeHHMM(window.start_time);
            const windowEnd = normalizeTimeHHMM(window.end_time) ?? selectedEnd;
            if (!windowStart) return false;
            return rangesOverlap(selectedStart, selectedEnd, windowStart, windowEnd);
          });
          if (conflicts) {
            cannotPlaySelectedSlots.add(selectedSlot.id);
          }
        }
        if (cannotPlaySelectedSlots.size > 0) {
          teamCannotPlaySlotIds.set(teamId, cannotPlaySelectedSlots);
        }
      }
    }

    if (teamIds.length > 0) {
      const { data: teamsData } = await supabase
        .from("tournament_teams")
        .select("id, display_name, player1:player1_id(last_name), player2:player2_id(last_name)")
        .in("id", teamIds);
      teamDisplayNames = new Map();
      (teamsData ?? []).forEach((row: Record<string, unknown>) => {
        const id = row.id as number;
        const displayName = row.display_name as string | null | undefined;
        const p1 = row.player1 as { last_name?: string } | { last_name?: string }[] | null | undefined;
        const p2 = row.player2 as { last_name?: string } | { last_name?: string }[] | null | undefined;
        const ln1 = Array.isArray(p1) ? p1[0]?.last_name : p1?.last_name;
        const ln2 = Array.isArray(p2) ? p2[0]?.last_name : p2?.last_name;
        const label =
          displayName?.trim() ||
          [ln1 ?? "", ln2 ?? ""].filter(Boolean).join("-") ||
          `Equipo ${id}`;
        teamDisplayNames!.set(id, label);
      });
    }

    const scheduledMatchIdsToRegenerate = new Set(matches.map((match) => match.id));
    const { data: scheduledMatches, error: scheduledMatchesError } = await supabase
      .from("tournament_matches")
      .select("id, match_date, start_time, end_time, court_id, status")
      .in("tournament_id", involvedTournamentIds)
      .in("court_id", scheduleConfig.courtIds)
      .not("match_date", "is", null)
      .not("start_time", "is", null)
      .not("court_id", "is", null)
      .neq("status", "cancelled");

    if (scheduledMatchesError) {
      return NextResponse.json(
        { error: `Error al cargar bloqueos de cancha: ${scheduledMatchesError.message}` },
        { status: 500 }
      );
    }

    blockedCourtIdsByTournamentSlotId = new Map<number, Set<number>>();
    const allTournamentSlotsSafe = tournamentSlots ?? [];
    const lockRows = (Array.isArray(scheduledMatches) ? scheduledMatches : []).filter(
      (row) => !scheduledMatchIdsToRegenerate.has(row.id)
    );
    for (const slot of allTournamentSlotsSafe) {
      const slotDate = String(slot.slot_date).trim().slice(0, 10);
      const slotStart = normalizeTimeHHMM(slot.start_time);
      const slotEnd = normalizeTimeHHMM(slot.end_time);
      if (!slotStart || !slotEnd) continue;

      for (const match of lockRows) {
        const matchDate = String(match.match_date ?? "").trim().slice(0, 10);
        if (!matchDate || matchDate !== slotDate) continue;
        const matchStart = normalizeTimeHHMM(match.start_time as string | null | undefined);
        const matchEnd = normalizeTimeHHMM(match.end_time as string | null | undefined) ?? slotEnd;
        if (!matchStart) continue;
        if (!rangesOverlap(slotStart, slotEnd, matchStart, matchEnd)) continue;

        const courtId = Number(match.court_id);
        if (!Number.isFinite(courtId)) continue;
        if (!blockedCourtIdsByTournamentSlotId.has(slot.id)) {
          blockedCourtIdsByTournamentSlotId.set(slot.id, new Set<number>());
        }
        blockedCourtIdsByTournamentSlotId.get(slot.id)!.add(courtId);
      }
    }
  }

  const matchDurationMinutes = t.match_duration ?? 60;

  console.log(`Regenerating schedule for ${matchesPayload.length} matches (algorithm: ${useRestrictions ? "with-restrictions" : "default"})${useRestrictions && tournamentSlots ? `, ${tournamentSlots.length} slots del torneo` : ""}`);

  const schedulerResult = await scheduleGroupMatches(
    matchesPayload,
    scheduleConfig.days,
    matchDurationMinutes,
    scheduleConfig.courtIds,
    undefined,
    teamRestrictions,
    undefined,
    {
      algorithm: useRestrictions ? "with-restrictions" : "default",
      ...(useRestrictions && tournamentSlots && teamCannotPlaySlotIds !== undefined
        ? {
            tournamentSlots,
            teamCannotPlaySlotIds,
            ...(blockedCourtIdsByTournamentSlotId
              ? { blockedCourtIdsByTournamentSlotId }
              : {}),
          }
        : {}),
      ...(teamDisplayNames ? { teamDisplayNames } : {}),
      ...(groupDisplayNames ? { groupDisplayNames } : {}),
    }
  );

  if (!schedulerResult.success) {
    console.error("Scheduler failed:", schedulerResult.error);
    return NextResponse.json(
      {
        error: schedulerResult.error || "No se pudieron asignar horarios para todos los partidos. Verifica que haya suficientes slots disponibles.",
      },
      { status: 400 }
    );
  }

  // 9) Actualizar los partidos en la base de datos
  // Mapear los payloads a los matches originales por tournament_group_id y match_order
  // Para partidos con equipos null, solo comparamos por tournament_group_id y match_order
  const updates = matches.map((match) => {
    const payload = schedulerResult.assignments.find(
      (a) => {
        const p = matchesPayload[a.matchIdx];
        return (
          p.tournament_group_id === match.tournament_group_id &&
          (p.match_order ?? null) === (match.match_order ?? null) &&
          // Si el match original tiene equipos, comparar por equipos también
          (match.team1_id === null || match.team2_id === null
            ? true // Si el match original tiene equipos null, cualquier payload con mismo grupo y orden sirve
            : p.team1_id === match.team1_id && p.team2_id === match.team2_id)
        );
      }
    );

    if (!payload) return null;

    return {
      id: match.id,
      match_date: payload.date,
      start_time: payload.startTime,
      end_time: payload.endTime,
      court_id: payload.courtId,
    };
  }).filter((u): u is { id: number; match_date: string; start_time: string; end_time: string; court_id: number } => 
    u !== null && u.match_date !== null && u.start_time !== null && u.end_time !== null && u.court_id !== undefined
  );

  // Actualizar todos los partidos
  let updatedCount = 0;
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("tournament_matches")
      .update({
        match_date: update.match_date,
        start_time: update.start_time,
        end_time: update.end_time,
        court_id: update.court_id,
      })
      .eq("id", update.id);

    if (updateError) {
      console.error(`Error updating match ${update.id}:`, updateError);
      // Continuar con los demás aunque falle uno
    } else {
      updatedCount++;
    }
  }

  return NextResponse.json({ 
    ok: true,
    updated: updatedCount,
    total: updates.length,
  });
}

