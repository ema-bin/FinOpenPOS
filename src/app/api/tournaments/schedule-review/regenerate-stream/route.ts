export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scheduleGroupMatches } from "@/lib/tournament-scheduler";

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

export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const sendLog = (message: string) => send({ type: "log", message });
      const sendProgress = (progress: number, status: string) =>
        send({ type: "progress", progress, status });
      const sendError = (error: string) => {
        send({ type: "error", error });
        controller.close();
      };
      const sendSuccess = (result: unknown) => {
        send({ type: "success", result });
        controller.close();
      };

      try {
        sendLog("Iniciando regeneración global de horarios...");
        sendProgress(10, "Buscando torneos en revisión...");

        const { data: tournaments, error: tournamentsError } = await supabase
          .from("tournaments")
          .select("id, name, match_duration")
          .eq("status", "schedule_review");

        if (tournamentsError) {
          sendError(`Error al obtener torneos: ${tournamentsError.message}`);
          return;
        }

        const scheduleReviewTournaments = Array.isArray(tournaments) ? tournaments : [];
        if (scheduleReviewTournaments.length === 0) {
          sendError("No hay torneos en schedule_review.");
          return;
        }

        const tournamentIds = scheduleReviewTournaments.map((t) => t.id);
        sendLog(
          `Torneos incluidos: ${scheduleReviewTournaments.length} (${scheduleReviewTournaments
            .map((t) => t.name)
            .join(", ")}).`
        );

        sendProgress(20, "Cargando slots disponibles...");
        const { data: allSlots, error: slotsError } = await supabase
          .from("tournament_group_slots")
          .select("id, tournament_id, slot_date, start_time, end_time")
          .in("tournament_id", tournamentIds)
          .order("slot_date", { ascending: true })
          .order("start_time", { ascending: true });

        if (slotsError) {
          sendError(`Error al obtener slots: ${slotsError.message}`);
          return;
        }

        const selectedSlots = Array.isArray(allSlots) ? allSlots : [];
        if (selectedSlots.length === 0) {
          sendError("No hay slots definidos para los torneos en schedule_review.");
          return;
        }
        sendLog(`Slots combinados: ${selectedSlots.length}.`);

        sendProgress(30, "Cargando partidos pendientes...");
        const { data: matches, error: matchesError } = await supabase
          .from("tournament_matches")
          .select(
            "id, tournament_id, tournament_group_id, team1_id, team2_id, match_order, set1_team1_games"
          )
          .in("tournament_id", tournamentIds)
          .eq("phase", "group")
          .is("set1_team1_games", null);

        if (matchesError) {
          sendError(`Error al obtener partidos: ${matchesError.message}`);
          return;
        }

        const pendingMatches = Array.isArray(matches) ? matches : [];
        if (pendingMatches.length === 0) {
          sendError("No hay partidos pendientes sin resultado en los torneos seleccionados.");
          return;
        }
        sendLog(`Partidos pendientes a programar: ${pendingMatches.length}.`);

        sendProgress(40, "Cargando canchas activas...");
        const { data: courts, error: courtsError } = await supabase
          .from("courts")
          .select("id")
          .eq("is_active", true);

        if (courtsError) {
          sendError(`Error al obtener canchas: ${courtsError.message}`);
          return;
        }

        const courtIds = (courts ?? []).map((c) => c.id);
        if (courtIds.length === 0) {
          sendError("No hay canchas activas para generar horarios.");
          return;
        }
        sendLog(`Canchas activas incluidas: ${courtIds.length}.`);

        sendProgress(45, "Limpiando horarios previos de partidos pendientes...");
        const { error: clearError } = await supabase
          .from("tournament_matches")
          .update({
            match_date: null,
            start_time: null,
            end_time: null,
            court_id: null,
          })
          .in("tournament_id", tournamentIds)
          .eq("phase", "group")
          .is("set1_team1_games", null);

        if (clearError) {
          sendError(`Error al limpiar horarios previos: ${clearError.message}`);
          return;
        }

        const matchesPayload = pendingMatches.map((match) => ({
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
          court_id: null,
        }));

        const groupIds = Array.from(
          new Set(
            pendingMatches
              .map((match) => match.tournament_group_id)
              .filter((id): id is number => typeof id === "number")
          )
        );
        const { data: groupsData, error: groupsError } = await supabase
          .from("tournament_groups")
          .select("id, name")
          .in("id", groupIds.length > 0 ? groupIds : [-1]);

        if (groupsError) {
          sendError(`Error al cargar nombres de grupos: ${groupsError.message}`);
          return;
        }

        const groupDisplayNames = new Map<number, string>();
        (groupsData ?? []).forEach((row: { id: number; name?: string | null }) => {
          groupDisplayNames.set(row.id, row.name?.trim() || `Grupo ${row.id}`);
        });

        const teamIds = Array.from(
          new Set(
            pendingMatches
              .flatMap((m) => [m.team1_id, m.team2_id])
              .filter((id): id is number => id !== null)
          )
        );

        sendProgress(50, "Aplicando restricciones de disponibilidad...");
        const { data: restrictions, error: restrictionsError } = await supabase
          .from("tournament_team_schedule_restrictions")
          .select("tournament_team_id, tournament_group_slot_id, can_play")
          .in("tournament_team_id", teamIds.length > 0 ? teamIds : [-1]);

        if (restrictionsError) {
          sendError(`Error al cargar restricciones: ${restrictionsError.message}`);
          return;
        }

        const cannotPlayRows = (restrictions ?? []).filter(
          (row: { can_play?: boolean }) => row.can_play === false
        ) as Array<{ tournament_team_id: number; tournament_group_slot_id: number }>;

        const restrictionSlotIds = Array.from(
          new Set(cannotPlayRows.map((row) => row.tournament_group_slot_id))
        );
        const { data: restrictionSlots, error: restrictionSlotsError } = await supabase
          .from("tournament_group_slots")
          .select("id, slot_date, start_time, end_time")
          .in("id", restrictionSlotIds.length > 0 ? restrictionSlotIds : [-1]);

        if (restrictionSlotsError) {
          sendError(`Error al cargar slots de restricciones: ${restrictionSlotsError.message}`);
          return;
        }

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
        cannotPlayRows.forEach((row) => {
          const slotData = restrictionSlotMap.get(row.tournament_group_slot_id);
          if (!slotData) return;
          if (!cannotPlayWindowsByTeam.has(row.tournament_team_id)) {
            cannotPlayWindowsByTeam.set(row.tournament_team_id, []);
          }
          cannotPlayWindowsByTeam.get(row.tournament_team_id)!.push(slotData);
        });

        const teamCannotPlaySlotIds = new Map<number, Set<number>>();
        cannotPlayWindowsByTeam.forEach((windows, teamId) => {
          const cannotPlaySelectedSlots = new Set<number>();
          selectedSlots.forEach((selectedSlot) => {
            const selectedDate = String(selectedSlot.slot_date).trim().slice(0, 10);
            const selectedStart = normalizeTimeHHMM(selectedSlot.start_time);
            const selectedEnd = normalizeTimeHHMM(selectedSlot.end_time);
            if (!selectedStart || !selectedEnd) return;

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
          });
          if (cannotPlaySelectedSlots.size > 0) {
            teamCannotPlaySlotIds.set(teamId, cannotPlaySelectedSlots);
          }
        });

        const { data: teamsData, error: teamsError } = await supabase
          .from("tournament_teams")
          .select("id, display_name, player1:player1_id(last_name), player2:player2_id(last_name)")
          .in("id", teamIds.length > 0 ? teamIds : [-1]);

        if (teamsError) {
          sendError(`Error al cargar equipos: ${teamsError.message}`);
          return;
        }

        const teamDisplayNames = new Map<number, string>();
        (teamsData ?? []).forEach((row: Record<string, unknown>) => {
          const id = row.id as number;
          const displayName = row.display_name as string | null | undefined;
          const p1 = row.player1 as
            | { last_name?: string }
            | { last_name?: string }[]
            | null
            | undefined;
          const p2 = row.player2 as
            | { last_name?: string }
            | { last_name?: string }[]
            | null
            | undefined;
          const ln1 = Array.isArray(p1) ? p1[0]?.last_name : p1?.last_name;
          const ln2 = Array.isArray(p2) ? p2[0]?.last_name : p2?.last_name;
          const label =
            displayName?.trim() ||
            [ln1 ?? "", ln2 ?? ""].filter(Boolean).join("-") ||
            `Equipo ${id}`;
          teamDisplayNames.set(id, label);
        });

        sendProgress(60, "Construyendo bloqueos de canchas ocupadas...");
        const scheduledMatchIdsToRegenerate = new Set(pendingMatches.map((match) => match.id));
        const { data: scheduledMatches, error: scheduledMatchesError } = await supabase
          .from("tournament_matches")
          .select("id, match_date, start_time, end_time, court_id, status")
          .in("tournament_id", tournamentIds)
          .in("court_id", courtIds)
          .not("match_date", "is", null)
          .not("start_time", "is", null)
          .not("court_id", "is", null)
          .neq("status", "cancelled");

        if (scheduledMatchesError) {
          sendError(`Error al cargar partidos ya agendados: ${scheduledMatchesError.message}`);
          return;
        }

        const blockedCourtIdsByTournamentSlotId = new Map<number, Set<number>>();
        const lockRows = (Array.isArray(scheduledMatches) ? scheduledMatches : []).filter(
          (row) => !scheduledMatchIdsToRegenerate.has(row.id)
        );
        selectedSlots.forEach((slot) => {
          const slotDate = String(slot.slot_date).trim().slice(0, 10);
          const slotStart = normalizeTimeHHMM(slot.start_time);
          const slotEnd = normalizeTimeHHMM(slot.end_time);
          if (!slotStart || !slotEnd) return;

          lockRows.forEach((match) => {
            const matchDate = String(match.match_date ?? "").trim().slice(0, 10);
            if (!matchDate || matchDate !== slotDate) return;
            const matchStart = normalizeTimeHHMM(match.start_time as string | null | undefined);
            const matchEnd = normalizeTimeHHMM(match.end_time as string | null | undefined) ?? slotEnd;
            if (!matchStart) return;
            if (!rangesOverlap(slotStart, slotEnd, matchStart, matchEnd)) return;

            const courtId = Number(match.court_id);
            if (!Number.isFinite(courtId)) return;

            if (!blockedCourtIdsByTournamentSlotId.has(slot.id)) {
              blockedCourtIdsByTournamentSlotId.set(slot.id, new Set<number>());
            }
            blockedCourtIdsByTournamentSlotId.get(slot.id)!.add(courtId);
          });
        });

        const maxDuration = Math.max(
          ...scheduleReviewTournaments.map((t) => Math.max(30, Number(t.match_duration) || 60)),
          60
        );
        sendLog(
          `Duración unificada para corrida global: ${maxDuration} min (máxima entre torneos seleccionados).`
        );

        sendProgress(70, "Ejecutando scheduler global...");
        const schedulerResult = await scheduleGroupMatches(
          matchesPayload,
          [],
          maxDuration,
          courtIds,
          undefined,
          undefined,
          sendLog,
          {
            algorithm: "with-restrictions",
            tournamentSlots: selectedSlots.map((slot) => ({
              id: slot.id,
              slot_date: slot.slot_date,
              start_time: slot.start_time,
              end_time: slot.end_time,
            })),
            teamCannotPlaySlotIds,
            blockedCourtIdsByTournamentSlotId,
            teamDisplayNames,
            groupDisplayNames,
          }
        );

        if (!schedulerResult.success || schedulerResult.assignments.length === 0) {
          sendError(
            schedulerResult.error ||
              "No se pudieron asignar horarios para la corrida global."
          );
          return;
        }

        sendLog(
          `Scheduler completado: ${schedulerResult.assignments.length}/${matchesPayload.length} partidos asignados.`
        );
        sendProgress(85, "Guardando asignaciones...");

        const assignmentsByMatchIdx = new Map<
          number,
          (typeof schedulerResult.assignments)[number]
        >();
        schedulerResult.assignments.forEach((assignment) => {
          assignmentsByMatchIdx.set(assignment.matchIdx, assignment);
        });

        let updatedCount = 0;
        let errorCount = 0;

        for (let idx = 0; idx < pendingMatches.length; idx++) {
          const match = pendingMatches[idx];
          const assignment = assignmentsByMatchIdx.get(idx);
          if (!assignment) continue;

          const { error: updateError } = await supabase
            .from("tournament_matches")
            .update({
              match_date: assignment.date,
              start_time: assignment.startTime,
              end_time: assignment.endTime === "24:00" ? "00:00" : assignment.endTime,
              court_id: assignment.courtId,
            })
            .eq("id", match.id);

          if (updateError) {
            errorCount++;
          } else {
            updatedCount++;
          }
        }

        sendProgress(100, "Proceso completado");
        sendSuccess({
          ok: true,
          tournaments: scheduleReviewTournaments.length,
          updatedCount,
          totalMatches: pendingMatches.length,
          errorCount,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Error interno en regeneración global";
        sendError(message);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
