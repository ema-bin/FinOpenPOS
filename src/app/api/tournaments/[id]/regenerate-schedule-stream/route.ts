export const dynamic = 'force-dynamic'
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildScheduleDaysFromSlots } from "@/lib/build-schedule-days-from-slots";
import {
  buildBlockedCourtsFromPhysicalSelections,
  mergeBlockedCourtsByTournamentSlot,
  parseTournamentPhysicalSlotSelections,
} from "@/lib/tournament-schedule-stream-payload";
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

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return new Response(
        JSON.stringify({ error: "Invalid id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Días y horarios se obtienen de los slots del torneo (misma fuente que las restricciones)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const parsedPhysicalSlots = parseTournamentPhysicalSlotSelections(body);
    const hasPhysicalSlotSelection = parsedPhysicalSlots.length > 0;
    const courtIds = Array.isArray(body.courtIds)
      ? body.courtIds
          .map((x: unknown) => Number(x))
          .filter((n: number): n is number => Number.isFinite(n) && n > 0)
      : [];
    const slotIds = Array.isArray(body.slotIds) ? body.slotIds : null;
    const matchDuration =
      typeof body.matchDuration === "number" &&
      Number.isFinite(body.matchDuration) &&
      body.matchDuration >= 30
        ? body.matchDuration
        : 60;
    const overlapTournamentIds = Array.isArray(body.overlapTournamentIds)
      ? Array.from(
          new Set(
            body.overlapTournamentIds
              .map((value: unknown) => Number(value))
              .filter(
                (value: number) =>
                  Number.isFinite(value) &&
                  value > 0 &&
                  value !== tournamentId
              )
          )
        )
      : [];

    const { data: allSlots, error: slotsError } = await supabase
      .from("tournament_group_slots")
      .select("id, slot_date, start_time, end_time")
      .eq("tournament_id", tournamentId)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (slotsError || !allSlots?.length) {
      return new Response(
        JSON.stringify({
          error:
            "No hay slots del torneo. Primero generá los horarios del torneo en Equipos → Generar horarios.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    type GroupSlotRow = { id: number; slot_date: string; start_time: string; end_time: string };
    const slotRows: GroupSlotRow[] = (allSlots as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      slot_date: String(row.slot_date ?? ""),
      start_time: String(row.start_time ?? ""),
      end_time: String(row.end_time ?? ""),
    }));

    const allSlotIds = new Set(slotRows.map((s) => s.id));
    if (hasPhysicalSlotSelection) {
      for (const p of parsedPhysicalSlots) {
        if (!allSlotIds.has(p.tournamentGroupSlotId)) {
          return new Response(
            JSON.stringify({
              error: "Hay combinaciones slot/cancha que no pertenecen a este torneo.",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const effectiveCourtIds = hasPhysicalSlotSelection
      ? Array.from(new Set(parsedPhysicalSlots.map((p) => p.courtId)))
      : courtIds;

    if (effectiveCourtIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Debés seleccionar al menos una cancha" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let slots: GroupSlotRow[];
    if (hasPhysicalSlotSelection) {
      const chosen = new Set(parsedPhysicalSlots.map((p) => p.tournamentGroupSlotId));
      slots = slotRows.filter((s) => chosen.has(s.id));
    } else if (slotIds && slotIds.length > 0) {
      const idSet = new Set(
        slotIds.map((x: unknown) => Number(x)).filter((n: number): n is number => Number.isFinite(n))
      );
      slots = slotRows.filter((s) => idSet.has(s.id));
    } else {
      slots = slotRows;
    }

    if (slots.length === 0) {
      return new Response(
        JSON.stringify({ error: "Ningún slot seleccionado o no coinciden con el torneo" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const days = buildScheduleDaysFromSlots(slots as Parameters<typeof buildScheduleDaysFromSlots>[0]);
    const scheduleConfig: ScheduleConfig = {
      days,
      matchDuration,
      courtIds: effectiveCourtIds,
    };

    // Crear un stream de Server-Sent Events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Buffer para acumular mensajes y enviarlos en lotes
        let logBuffer: Uint8Array[] = [];
        let flushScheduled = false;
        const MAX_BUFFER_SIZE = 10; // Vaciar el buffer después de 10 mensajes
        
        // Vaciar el buffer periódicamente cada 100ms para asegurar que los mensajes se envíen en tiempo real
        const flushInterval = setInterval(() => {
          if (logBuffer.length > 0) {
            flushLogs();
          }
        }, 100);
        
        const flushLogs = () => {
          if (logBuffer.length === 0) {
            flushScheduled = false;
            return;
          }
          try {
            for (const encoded of logBuffer) {
              controller.enqueue(encoded);
            }
            logBuffer = [];
            flushScheduled = false;
          } catch (error) {
            console.error("Error flushing logs:", error);
            logBuffer = [];
            flushScheduled = false;
          }
        };
        
        const sendLog = (message: string) => {
          console.log(`[Regenerate Schedule] ${message}`);
          try {
            const data = JSON.stringify({ type: "log", message });
            const encoded = encoder.encode(`data: ${data}\n\n`);
            logBuffer.push(encoded);
            
            // Si el buffer está lleno, vaciarlo inmediatamente
            if (logBuffer.length >= MAX_BUFFER_SIZE) {
              flushLogs();
            } else if (!flushScheduled) {
              // Programar el flush si no está ya programado
              flushScheduled = true;
              // Usar setImmediate para permitir que el stream procese los mensajes
              setImmediate(flushLogs);
            }
          } catch (error) {
            console.error("Error sending log:", error);
          }
        };

        const sendProgress = (progress: number, status: string) => {
          console.log(`[Regenerate Schedule] Progress: ${progress}% - ${status}`);
          const data = JSON.stringify({ type: "progress", progress, status });
          const encoded = encoder.encode(`data: ${data}\n\n`);
          logBuffer.push(encoded);
          if (!flushScheduled) {
            flushScheduled = true;
            setImmediate(flushLogs);
          }
        };

        const sendError = (error: string) => {
          console.error(`[Regenerate Schedule] Error: ${error}`);
          // Limpiar el intervalo
          clearInterval(flushInterval);
          // Flush logs pendientes antes de enviar el error
          flushLogs();
          const data = JSON.stringify({ type: "error", error });
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.close();
          } catch (err) {
            console.error("Error enqueueing error:", err);
          }
        };

        const sendSuccess = (result: any) => {
          console.log(`[Regenerate Schedule] Success:`, result);
          // Limpiar el intervalo
          clearInterval(flushInterval);
          // Flush logs pendientes antes de enviar el éxito
          flushLogs();
          const data = JSON.stringify({ type: "success", result });
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.close();
          } catch (error) {
            console.error("Error enqueueing success:", error);
          }
        };

        try {
          sendLog("Iniciando proceso de regeneración de horarios...");
          sendProgress(10, "Verificando torneo...");

          // 1) Verificar que el torneo existe y pertenece al usuario
          const { data: t, error: terr } = await supabase
            .from("tournaments")
            .select("id, status, user_uid, match_duration")
            .eq("id", tournamentId)
            .single();

          if (terr || !t) {
            sendError("Torneo no encontrado");
            return;
          }

          const involvedTournamentIds = Array.from(
            new Set([tournamentId, ...overlapTournamentIds])
          );
          sendLog(
            involvedTournamentIds.length > 1
              ? `Modo multi-torneo activo: ${involvedTournamentIds.length} torneos en una sola corrida.`
              : "Modo torneo único activo."
          );

          sendProgress(20, "Obteniendo partidos de fase de grupos...");

          // 2) Obtener todos los partidos de fase de grupos sin resultados
          // Un partido sin resultados es aquel donde set1_team1_games es null
          const { data: matches, error: matchesError } = await supabase
            .from("tournament_matches")
            .select(
              "id, tournament_id, tournament_group_id, team1_id, team2_id, match_order, status, set1_team1_games, court_id"
            )
            .in("tournament_id", involvedTournamentIds)
            .eq("phase", "group")
            .is("set1_team1_games", null); // Solo partidos sin resultados

          if (matchesError) {
            sendError("Error al obtener partidos: " + matchesError.message);
            return;
          }

          if (!matches || matches.length === 0) {
            // Verificar si hay partidos con resultados para dar un mensaje más específico
            const { data: allMatches } = await supabase
              .from("tournament_matches")
              .select("id")
              .in("tournament_id", involvedTournamentIds)
              .eq("phase", "group");
            
            if (allMatches && allMatches.length > 0) {
              sendError("Todos los partidos de fase de grupos ya tienen resultados cargados en los torneos seleccionados. Solo se pueden regenerar horarios de partidos sin resultados.");
            } else {
              sendError("No se encontraron partidos de fase de grupos para regenerar horarios en los torneos seleccionados");
            }
            return;
          }

          sendLog(
            `Encontrados ${matches.length} partidos sin resultados en ${involvedTournamentIds.length} torneo(s).`
          );
          sendProgress(30, "Limpiando horarios previos...");

          // 3) Limpiar horarios de los partidos a regenerar (solo sin resultados)
          sendLog("Limpiando horarios previos de los partidos sin resultados a regenerar...");
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
            .is("set1_team1_games", null);

          if (clearError) {
            sendError(`Error al limpiar horarios previos: ${clearError.message}`);
            return;
          }

          sendLog("✅ Horarios previos limpiados correctamente");

          sendLog(`✅ Horarios previos limpiados para ${matches.length} partidos`);
          sendProgress(40, "Preparando datos para el scheduler...");

          // 4) Construir el payload para el scheduler
          sendLog("Construyendo payload de partidos...");
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
            court_id: null,
          }));
          sendLog(`Payload construido: ${matchesPayload.length} partidos`);

          const groupIds = Array.from(new Set(matches.map((m) => m.tournament_group_id)));
          const { data: groupsData } = await supabase
            .from("tournament_groups")
            .select("id, name")
            .in("id", groupIds);
          const groupDisplayNames = new Map<number, string>();
          (groupsData ?? []).forEach((row: { id: number; name?: string | null }) => {
            groupDisplayNames.set(row.id, row.name?.trim() || `Grupo ${row.id}`);
          });

          const useRestrictions = body.algorithm === "with-restrictions";
          const useTournamentSlotMode = useRestrictions || hasPhysicalSlotSelection;
          let teamRestrictions: Map<number, Array<{ date: string; start_time: string; end_time: string }>> | undefined;
          let tournamentSlots: Array<{ id: number; slot_date: string; start_time: string; end_time: string }> | undefined;
          let teamCannotPlaySlotIds: Map<number, Set<number>> | undefined;
          let blockedCourtIdsByTournamentSlotId: Map<number, Set<number>> | undefined;
          let teamDisplayNames: Map<number, string> | undefined;

          if (useTournamentSlotMode) {
            tournamentSlots = slots.map((s: { id: number; slot_date: string; start_time: string; end_time: string }) => ({
              id: s.id,
              slot_date: s.slot_date,
              start_time: s.start_time,
              end_time: s.end_time,
            }));
          }

          if (useRestrictions) {
            const teamIds = Array.from(new Set(matches.flatMap((m) => [m.team1_id, m.team2_id]).filter((id): id is number => id !== null)));
            const { data: restrictions, error: restrictionsError } = await supabase
              .from("tournament_team_schedule_restrictions")
              .select("tournament_team_id, tournament_group_slot_id, can_play")
              .in("tournament_team_id", teamIds.length > 0 ? teamIds : [-1]);

            teamCannotPlaySlotIds = new Map();
            if (restrictionsError) {
              sendError(`Error al cargar restricciones de equipos: ${restrictionsError.message}`);
              return;
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
                sendError(`Error al cargar slots de restricciones: ${restrictionSlotsError.message}`);
                return;
              }

              const selectedSlotsSafe = tournamentSlots ?? [];
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

              cannotPlayWindowsByTeam.forEach((windows, teamId) => {
                const cannotPlaySelectedSlots = new Set<number>();
                for (const selectedSlot of selectedSlotsSafe) {
                  const selectedDate = String(selectedSlot.slot_date).trim().slice(0, 10);
                  const selectedStart = normalizeTimeHHMM(selectedSlot.start_time);
                  const selectedEnd = normalizeTimeHHMM(selectedSlot.end_time);
                  if (!selectedStart || !selectedEnd) continue;

                  const conflicts = windows.some((window) => {
                    const windowDate = String(window.slot_date).trim().slice(0, 10);
                    if (windowDate !== selectedDate) return false;
                    const windowStart = normalizeTimeHHMM(window.start_time);
                    const windowEnd =
                      normalizeTimeHHMM(window.end_time) ?? selectedEnd;
                    if (!windowStart) return false;
                    return rangesOverlap(
                      selectedStart,
                      selectedEnd,
                      windowStart,
                      windowEnd
                    );
                  });
                  if (conflicts) {
                    cannotPlaySelectedSlots.add(selectedSlot.id);
                  }
                }

                if (cannotPlaySelectedSlots.size > 0) {
                  teamCannotPlaySlotIds!.set(teamId, cannotPlaySelectedSlots);
                }
              });
              sendLog(
                `Restricciones cargadas para ${teamCannotPlaySlotIds.size} equipos (slots seleccionados donde NO pueden jugar).`
              );
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
          }

          if (!useRestrictions && useTournamentSlotMode) {
            teamCannotPlaySlotIds = new Map();
          }

          if (useTournamentSlotMode) {
            const scheduledMatchIdsToRegenerate = new Set(
              matches.map((match) => match.id)
            );
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
              sendError(`Error al cargar bloqueos de cancha: ${scheduledMatchesError.message}`);
              return;
            }

            blockedCourtIdsByTournamentSlotId = new Map<number, Set<number>>();
            const selectedSlotsById = new Map(
              slots.map((slot: { id: number; slot_date: string; start_time: string; end_time: string }) => [
                slot.id,
                slot,
              ])
            );
            const lockRows = (Array.isArray(scheduledMatches) ? scheduledMatches : []).filter(
              (row) => !scheduledMatchIdsToRegenerate.has(row.id)
            );
            let blockedCount = 0;
            selectedSlotsById.forEach((slot) => {
              const slotDate = String(slot.slot_date).trim().slice(0, 10);
              const slotStart = normalizeTimeHHMM(slot.start_time);
              const slotEnd = normalizeTimeHHMM(slot.end_time);
              if (!slotStart || !slotEnd) return;

              for (const match of lockRows) {
                const matchDate = String(match.match_date ?? "").trim().slice(0, 10);
                if (!matchDate || matchDate !== slotDate) continue;
                const matchStart = normalizeTimeHHMM(match.start_time as string | null | undefined);
                const matchEnd = normalizeTimeHHMM(match.end_time as string | null | undefined) ?? slotEnd;
                if (!matchStart) continue;

                if (!rangesOverlap(slotStart, slotEnd, matchStart, matchEnd)) continue;
                const courtId = Number(match.court_id);
                if (!Number.isFinite(courtId)) continue;

                if (!blockedCourtIdsByTournamentSlotId!.has(slot.id)) {
                  blockedCourtIdsByTournamentSlotId!.set(slot.id, new Set<number>());
                }
                const blockedSet = blockedCourtIdsByTournamentSlotId!.get(slot.id)!;
                if (!blockedSet.has(courtId)) {
                  blockedSet.add(courtId);
                  blockedCount++;
                }
              }
            });

            sendLog(
              blockedCount > 0
                ? `Bloqueos de cancha aplicados: ${blockedCount} en ${blockedCourtIdsByTournamentSlotId.size} slot(s) por partidos ya agendados.`
                : "Sin bloqueos de cancha por partidos ya agendados."
            );

            if (hasPhysicalSlotSelection) {
              const physicalBlocked = buildBlockedCourtsFromPhysicalSelections(
                scheduleConfig.courtIds,
                slots.map((s: { id: number }) => s.id),
                parsedPhysicalSlots
              );
              blockedCourtIdsByTournamentSlotId =
                mergeBlockedCourtsByTournamentSlot(blockedCourtIdsByTournamentSlotId, physicalBlocked) ??
                blockedCourtIdsByTournamentSlotId;
            }
          }

          sendLog("Horarios disponibles: slots del torneo");
          const availableSchedules = undefined;

          const matchDurationMinutes = scheduleConfig.matchDuration || 60;
          sendLog(`Duración de partidos: ${matchDurationMinutes} minutos`);
          sendLog(`Canchas seleccionadas: ${scheduleConfig.courtIds.length}`);
          sendLog(`Slots del torneo: ${scheduleConfig.days.length} (mismo conjunto que restricciones)`);

          sendLog("Validando configuración...");
          if (!scheduleConfig.days || scheduleConfig.days.length === 0) {
            sendError("No hay slots del torneo. Generá los horarios en Equipos → Generar horarios.");
            return;
          }
          if (!scheduleConfig.courtIds || scheduleConfig.courtIds.length === 0) {
            sendError("No hay canchas seleccionadas para generar horarios");
            return;
          }
          sendLog("✅ Configuración válida");

          sendProgress(60, "Generando horarios con algoritmo inteligente...");

          sendLog(
            useTournamentSlotMode
              ? useRestrictions
                ? "Iniciando algoritmo con restricciones (slots del torneo = can_play)..."
                : "Iniciando algoritmo con slots del torneo y canchas elegidas por horario..."
              : "Iniciando algoritmo de asignación (sin restricciones)..."
          );
          sendLog(`Llamando a scheduleGroupMatches con ${matchesPayload.length} partidos...`);
          
          let schedulerResult;
          try {
            if (!sendLog) {
              sendError("Error: callback de logging no está definido");
              return;
            }
            
            schedulerResult = await scheduleGroupMatches(
              matchesPayload,
              scheduleConfig.days,
              matchDurationMinutes,
              scheduleConfig.courtIds,
              availableSchedules || undefined,
              teamRestrictions,
              sendLog,
              {
                algorithm: useTournamentSlotMode ? "with-restrictions" : "default",
                ...(useTournamentSlotMode &&
                tournamentSlots &&
                teamCannotPlaySlotIds !== undefined
                  ? {
                      tournamentSlots,
                      teamCannotPlaySlotIds,
                      ...(blockedCourtIdsByTournamentSlotId?.size
                        ? { blockedCourtIdsByTournamentSlotId }
                        : {}),
                    }
                  : {}),
                ...(teamDisplayNames ? { teamDisplayNames } : {}),
                ...(groupDisplayNames.size > 0 ? { groupDisplayNames } : {}),
              }
            );

            sendLog(`Algoritmo completado. Resultado: ${schedulerResult.success ? "éxito completo" : "parcial"}`);
            sendLog(`Matches asignados: ${schedulerResult.assignments.length}/${matchesPayload.length}`);

            if (schedulerResult.assignments.length === 0) {
              sendError(schedulerResult.error || "No se pudieron asignar horarios para ningún partido");
              return;
            }

            if (!schedulerResult.success) {
              sendLog(`⚠️ Solución parcial: ${schedulerResult.assignments.length}/${matchesPayload.length} partidos asignados`);
              sendLog(`⚠️ ${schedulerResult.error || "Algunos partidos no pudieron ser asignados"}`);
            } else {
              sendLog(`✅ Horarios asignados exitosamente para todos los ${matchesPayload.length} partidos`);
            }
          } catch (schedulerError: any) {
            sendError(`Error en el scheduler: ${schedulerError.message || schedulerError.toString()}`);
            console.error("Scheduler error:", schedulerError);
            return;
          }

          // Verificar que schedulerResult está definido y tiene asignaciones
          if (!schedulerResult || schedulerResult.assignments.length === 0) {
            sendError("Error: No se pudo obtener resultado del scheduler o no hay asignaciones");
            return;
          }

          sendProgress(80, "Actualizando partidos en la base de datos...");

          // 8) Actualizar los partidos en la base de datos
          sendLog(`Total de assignments del scheduler: ${schedulerResult.assignments.length}`);
          sendLog(`Total de matches en la base de datos: ${matches.length}`);
          sendLog(`Total de matchesPayload: ${matchesPayload.length}`);

          // Crear un mapa de assignments por matchIdx para acceso rápido
          const assignmentsByMatchIdx = new Map<number, typeof schedulerResult.assignments[0]>();
          for (const assignment of schedulerResult.assignments) {
            assignmentsByMatchIdx.set(assignment.matchIdx, assignment);
          }

          sendLog(`📊 Assignments disponibles: ${schedulerResult.assignments.length}`);
          sendLog(`📊 Match indices con assignment: ${Array.from(assignmentsByMatchIdx.keys()).sort((a, b) => a - b).join(", ")}`);
          
          // Mostrar detalles de los assignments
          for (const [matchIdx, assignment] of Array.from(assignmentsByMatchIdx.entries())) {
            sendLog(`  Assignment matchIdx ${matchIdx}: ${assignment.date} ${assignment.startTime}-${assignment.endTime} (Cancha ${assignment.courtId})`);
          }

          const updates = matches.map((match, matchIdx) => {
            // Buscar el assignment correspondiente usando el índice directamente
            const assignment = assignmentsByMatchIdx.get(matchIdx);

            if (!assignment) {
              sendLog(`⚠️ No se encontró assignment para match ${match.id} (índice ${matchIdx}, grupo ${match.tournament_group_id})`);
              
              // Intentar matching alternativo por características del match
              // Buscar en todos los assignments disponibles
              for (const [assignedMatchIdx, fallbackAssignment] of Array.from(assignmentsByMatchIdx.entries())) {
                const p = matchesPayload[assignedMatchIdx];
                
                // Verificar si este assignment corresponde a este match
                const groupMatch = p.tournament_group_id === match.tournament_group_id;
                const orderMatch = (p.match_order ?? null) === (match.match_order ?? null);
                const teamsMatch = match.team1_id === null || match.team2_id === null
                  ? true // Si el match original tiene equipos null, cualquier payload con mismo grupo y orden sirve
                  : (p.team1_id === match.team1_id && p.team2_id === match.team2_id) ||
                    (p.team1_id === match.team2_id && p.team2_id === match.team1_id); // También verificar orden inverso
                
                if (groupMatch && orderMatch && teamsMatch) {
                  sendLog(`✅ Encontrado assignment alternativo para match ${match.id} (usando assignment del matchIdx ${assignedMatchIdx})`);
                  return {
                    id: match.id,
                    match_date: fallbackAssignment.date,
                    start_time: fallbackAssignment.startTime,
                    end_time: fallbackAssignment.endTime,
                    court_id: fallbackAssignment.courtId,
                  };
                }
              }
              
              sendLog(`❌ No se encontró assignment alternativo para match ${match.id}`);
              return null;
            }

            // Verificar que el assignment tenga todos los valores necesarios
            if (!assignment.date || !assignment.startTime || !assignment.endTime || assignment.courtId === undefined) {
              sendLog(`⚠️ Assignment para match ${match.id} tiene valores incompletos: date=${assignment.date}, startTime=${assignment.startTime}, endTime=${assignment.endTime}, courtId=${assignment.courtId}`);
              return null;
            }

            sendLog(`✅ Assignment encontrado para match ${match.id} (índice ${matchIdx}): ${assignment.date} ${assignment.startTime} (Cancha ${assignment.courtId})`);

            return {
              id: match.id,
              match_date: assignment.date,
              start_time: assignment.startTime,
              end_time: assignment.endTime,
              court_id: assignment.courtId,
            };
          }).filter((u): u is { id: number; match_date: string; start_time: string; end_time: string; court_id: number } => {
            if (u === null) return false;
            const valid = u.match_date !== null && u.match_date !== undefined &&
                         u.start_time !== null && u.start_time !== undefined &&
                         u.end_time !== null && u.end_time !== undefined &&
                         u.court_id !== null && u.court_id !== undefined;
            if (!valid) {
              sendLog(`⚠️ Update filtrado para match ${u.id}: valores inválidos`);
            }
            return valid;
          });

          sendLog(`Matches con assignment encontrado: ${updates.length} de ${matches.length}`);
          if (updates.length < matches.length) {
            const missing = matches.length - updates.length;
            sendLog(`⚠️ ADVERTENCIA: ${missing} partidos no tienen assignment y no se actualizarán`);
          }

          if (updates.length === 0) {
            sendError("No hay matches para actualizar. Verifica que el scheduler haya asignado horarios correctamente.");
            return;
          }

          // Actualizar todos los partidos
          let updatedCount = 0;
          let errorCount = 0;
          
          sendLog(`🔄 Iniciando actualización de ${updates.length} partidos en la base de datos...`);
          
          // Mostrar resumen de lo que se va a actualizar
          for (const update of updates) {
            sendLog(`  📝 Match ${update.id} → ${update.match_date} ${update.start_time}-${update.end_time} (Cancha ${update.court_id})`);
          }
          
          for (const update of updates) {
            // Validar que todos los valores estén presentes antes de actualizar
            if (!update.match_date || !update.start_time || !update.end_time || update.court_id === undefined || update.court_id === null) {
              sendLog(`  ❌ Match ${update.id} tiene valores inválidos: date=${update.match_date}, start=${update.start_time}, end=${update.end_time}, court=${update.court_id}`);
              errorCount++;
              continue;
            }
            
            sendLog(`  🔄 Actualizando match ${update.id}...`);
            
            // Convertir "24:00" a "00:00" del día siguiente si es necesario
            let endTime = update.end_time;
            if (endTime === "24:00") {
              endTime = "00:00";
            }
            
            const updatePayload = {
              match_date: update.match_date,
              start_time: update.start_time,
              end_time: endTime,
              court_id: update.court_id,
            };
            
            sendLog(`  📤 Payload: ${JSON.stringify(updatePayload)}`);
            
            // Hacer el update con count para verificar que realmente se actualizó
            const { error: updateError, count } = await supabase
              .from("tournament_matches")
              .update(updatePayload)
              .eq("id", update.id);
            
            if (updateError) {
              console.error(`Error updating match ${update.id}:`, updateError);
              sendLog(`  ❌ Error actualizando match ${update.id}: ${updateError.message}`);
              errorCount++;
            } else if (count === 0) {
              sendLog(`  ⚠️ Match ${update.id}: Update ejecutado pero 0 filas afectadas (posiblemente no se encontró el match o RLS bloqueó)`);
              errorCount++;
            } else {
              // Si no hay error y count > 0, se guardó correctamente
              sendLog(`  ✅ Match ${update.id} actualizado (${count} fila(s)): ${update.match_date} ${update.start_time} (Cancha ${update.court_id})`);
              updatedCount++;
            }
          }

          sendLog(`✅ Actualización completada: ${updatedCount} partidos actualizados, ${errorCount} errores`);

          const { error: courtMetaError } = await supabase
            .from("tournaments")
            .update({ group_schedule_court_ids: scheduleConfig.courtIds })
            .eq("id", tournamentId);

          if (courtMetaError) {
            sendLog(`⚠️ No se pudo guardar la lista de canchas del torneo: ${courtMetaError.message}`);
          }

          sendProgress(100, "¡Proceso completado!");
          sendSuccess({ ok: true, updatedCount });
        } catch (error: any) {
          console.error("Error in regenerate-schedule-stream:", error);
          sendError(error instanceof Error ? error.message : "Error interno del servidor");
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Error in regenerate-schedule-stream:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

