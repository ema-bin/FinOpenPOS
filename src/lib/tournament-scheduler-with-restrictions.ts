// Algoritmo de asignación CON restricciones horarias.
// Copia independiente del beam search para poder mejorarlo sin tocar el otro.
// Misma lógica que tournament-scheduler-beam-search pero construye y usa groupRestrictions.

import type { ScheduleDay, AvailableSchedule } from "@/models/dto/tournament";
import type { GroupMatchPayload, Assignment, SchedulerResult, TimeSlot } from "./tournament-scheduler";
import { calculateEndTime, generateTimeSlots, slotViolatesRestriction } from "./tournament-scheduler";

type Group = {
  groupId: number;
  matches: GroupMatchPayload[];
  teams: number[];
  size: 3 | 4;
};

type State = {
  usedSlots: Set<string>;
  assignments: Map<string, string[]>;
  score: number;
};

type Slot = {
  index: number;
  date: string;
  startTime: string;
  endTime: string;
  datetime: Date;
  slotId: string;
};

type ScheduleResult =
  | { ok: true; assignments: Map<string, string[]> }
  | { ok: false; reason: string };

type BeamSearchOptions = {
  beamWidth?: number;
  maxCandidates?: number;
};

function toHHMM(time: string): string {
  const s = String(time).trim();
  if (s.length >= 5) return s.substring(0, 5);
  return s;
}

function timeSlotToSlot(timeSlot: TimeSlot, index: number): Slot {
  const dateStr = typeof timeSlot.date === "string" ? timeSlot.date : String(timeSlot.date);
  const startNorm = toHHMM(timeSlot.startTime);
  const endNorm = toHHMM(timeSlot.endTime);
  const datetime = new Date(`${dateStr}T${startNorm}:00`);
  return {
    index,
    date: dateStr,
    startTime: startNorm,
    endTime: endNorm,
    datetime,
    slotId: String(index),
  };
}

function isValidSlotGroup(
  slots: Slot[],
  matchDurationMs: number,
  groupSize: 3 | 4
): boolean {
  if (slots.length !== groupSize) return false;
  const sorted = [...slots].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = sorted[i].datetime.getTime() + matchDurationMs;
    const nextStart = sorted[i + 1].datetime.getTime();
    if (nextStart < currentEnd + matchDurationMs) return false;
  }
  return true;
}

function scoreSlotGroup(slots: Slot[]): number {
  const sorted = [...slots].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const spanMinutes = (sorted[sorted.length - 1].datetime.getTime() - sorted[0].datetime.getTime()) / (1000 * 60);
  return -spanMinutes;
}

function generateCandidates(
  group: Group,
  availableSlots: Slot[],
  usedSlotIds: Set<string>,
  matchDurationMs: number,
  maxCandidates: number,
  restrictedSlotIds?: Set<string>
): Array<{ slots: Slot[]; score: number }> {
  const freeSlots = availableSlots.filter((slot) => {
    if (usedSlotIds.has(slot.slotId)) return false;
    if (restrictedSlotIds?.has(slot.slotId)) return false;
    return true;
  });

  if (freeSlots.length < group.size) return [];

  const candidates: Array<{ slots: Slot[]; score: number }> = [];
  const addValidCombinations = (arr: Slot[], n: number, start: number = 0, current: Slot[] = []): void => {
    if (current.length === n) {
      if (isValidSlotGroup(current, matchDurationMs, group.size)) {
        candidates.push({ slots: [...current], score: scoreSlotGroup(current) });
      }
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      addValidCombinations(arr, n, i + 1, current);
      current.pop();
    }
  };
  addValidCombinations(freeSlots, group.size);

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxCandidates);
}

function runBeamSearch(
  groups: Group[],
  slots: Slot[],
  matchDurationMs: number,
  groupRestrictions: Map<number, Set<string>>,
  options?: BeamSearchOptions
): ScheduleResult {
  const beamWidth = options?.beamWidth ?? 5;
  const maxCandidates = options?.maxCandidates ?? 20;
  let states: State[] = [{ usedSlots: new Set(), assignments: new Map(), score: 0 }];

  for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
    const group = groups[groupIdx];
    const newStates: State[] = [];
    const restrictedSlotIds = groupRestrictions.get(group.groupId);

    for (const state of states) {
      const candidates = generateCandidates(
        group,
        slots,
        state.usedSlots,
        matchDurationMs,
        maxCandidates,
        restrictedSlotIds
      );
      if (candidates.length === 0) continue;

      for (const candidate of candidates) {
        const newUsedSlots = new Set(state.usedSlots);
        const newAssignments = new Map(state.assignments);
        const slotIds: string[] = [];
        for (const slot of candidate.slots) {
          newUsedSlots.add(slot.slotId);
          slotIds.push(slot.slotId);
        }
        newAssignments.set(String(group.groupId), slotIds);
        newStates.push({
          usedSlots: newUsedSlots,
          assignments: newAssignments,
          score: state.score + candidate.score,
        });
      }
    }

    if (newStates.length === 0) {
      return {
        ok: false,
        reason: `No se pudo asignar slots para el grupo ${group.groupId} (grupo ${groupIdx + 1}/${groups.length})`,
      };
    }
    newStates.sort((a, b) => b.score - a.score);
    states = newStates.slice(0, beamWidth);
  }

  if (states.length === 0) {
    return { ok: false, reason: "No se encontró ninguna solución" };
  }
  return { ok: true, assignments: states[0].assignments };
}

/**
 * Algoritmo con restricciones horarias. Lógica duplicada y separada para poder mejorarla sin tocar el otro.
 */
export async function scheduleGroupMatchesWithRestrictions(
  matchesPayload: GroupMatchPayload[],
  days: ScheduleDay[],
  matchDurationMinutes: number,
  courtIds: number[],
  availableSchedules?: AvailableSchedule[],
  teamRestrictions?: Map<number, Array<{ date: string; start_time: string; end_time: string }>>,
  onLog?: (message: string) => void
): Promise<SchedulerResult> {
  if (onLog) {
    onLog("🧩 Algoritmo con restricciones horarias: Iniciando...");
    onLog("📋 Procesando grupos de 3 y 4");
  }

  if (!days.length || !courtIds.length) {
    return { success: false, error: "Configuración de horarios o canchas inválida", assignments: [] };
  }

  const matchesByGroup = new Map<number, GroupMatchPayload[]>();
  for (const match of matchesPayload) {
    if (!matchesByGroup.has(match.tournament_group_id)) {
      matchesByGroup.set(match.tournament_group_id, []);
    }
    matchesByGroup.get(match.tournament_group_id)!.push(match);
  }

  const groups: Group[] = [];
  for (const [groupId, matches] of Array.from(matchesByGroup.entries())) {
    const teams = new Set<number>();
    for (const match of matches) {
      if (match.team1_id !== null) teams.add(match.team1_id);
      if (match.team2_id !== null) teams.add(match.team2_id);
    }

    let groupSize: 3 | 4;
    if (matches.some((m: GroupMatchPayload) => m.match_order !== undefined)) {
      groupSize = 4;
      if (matches.length !== 4) {
        if (onLog) onLog(`⚠️ Ignorando grupo ${groupId}: tiene match_order pero ${matches.length} matches (esperado 4)`);
        continue;
      }
      if (teams.size !== 4) {
        if (onLog) onLog(`⚠️ Ignorando grupo ${groupId}: tiene ${teams.size} equipos únicos (esperado 4)`);
        continue;
      }
    } else {
      groupSize = 3;
      if (matches.length !== 3) {
        if (onLog) onLog(`⚠️ Ignorando grupo ${groupId}: tiene ${matches.length} matches (esperado 3)`);
        continue;
      }
      if (teams.size !== 3) {
        if (onLog) onLog(`⚠️ Ignorando grupo ${groupId}: tiene ${teams.size} equipos únicos (esperado 3)`);
        continue;
      }
    }
    groups.push({ groupId, matches, teams: Array.from(teams), size: groupSize });
  }

  if (groups.length === 0) {
    return { success: false, error: "No se encontraron grupos válidos (de 3 o 4) para programar", assignments: [] };
  }

  const groupsOf3 = groups.filter((g) => g.size === 3).length;
  const groupsOf4 = groups.filter((g) => g.size === 4).length;
  if (onLog) onLog(`📊 Encontrados ${groups.length} grupos: ${groupsOf3} de 3, ${groupsOf4} de 4`);

  const timeSlots = generateTimeSlots(days, matchDurationMinutes, courtIds.length, availableSchedules);
  if (onLog) onLog(`📅 Total de slots generados: ${timeSlots.length}`);

  const requiredSlots = groups.reduce((sum, g) => sum + g.size, 0);
  if (timeSlots.length < requiredSlots) {
    return {
      success: false,
      error: `No hay suficientes slots. Necesito ${requiredSlots} pero hay ${timeSlots.length}.`,
      assignments: [],
    };
  }

  const slots: Slot[] = timeSlots.map((ts, idx) => timeSlotToSlot(ts, idx));
  slots.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

  const groupRestrictions = new Map<number, Set<string>>();
  if (teamRestrictions?.size) {
    for (const group of groups) {
      const restrictedSlotIds = new Set<string>();
      for (const slot of slots) {
        const timeSlot: TimeSlot = { date: slot.date, startTime: slot.startTime, endTime: slot.endTime };
        for (const teamId of group.teams) {
          const restrictedSchedules = teamRestrictions.get(teamId);
          if (slotViolatesRestriction(timeSlot, restrictedSchedules)) {
            restrictedSlotIds.add(slot.slotId);
            break;
          }
        }
      }
      groupRestrictions.set(group.groupId, restrictedSlotIds);
    }
  }

  const matchDurationMs = matchDurationMinutes * 60 * 1000;
  const result = runBeamSearch(groups, slots, matchDurationMs, groupRestrictions, {
    beamWidth: 10,
    maxCandidates: 30,
  });

  if (!result.ok) {
    return { success: false, error: result.reason, assignments: [] };
  }

  if (onLog) onLog(`✅ Algoritmo con restricciones completado: ${result.assignments.size} grupos asignados`);

  const assignments: Assignment[] = [];
  for (const [groupIdStr, slotIds] of Array.from(result.assignments.entries())) {
    const groupId = Number(groupIdStr);
    const group = groups.find((g) => g.groupId === groupId);
    if (!group) continue;
    const groupMatches = matchesByGroup.get(groupId) || [];
    if (groupMatches.length !== group.size || slotIds.length !== group.size) continue;

    const assignedSlots = slotIds
      .map((id) => slots.find((s) => s.slotId === id))
      .filter((s): s is Slot => s !== undefined)
      .sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

    if (group.size === 3) {
      for (let i = 0; i < 3; i++) {
        const match = groupMatches[i];
        const slot = assignedSlots[i];
        if (!slot) continue;
        const matchIdx = matchesPayload.findIndex(
          (m) =>
            m.tournament_group_id === match.tournament_group_id &&
            m.team1_id === match.team1_id &&
            m.team2_id === match.team2_id &&
            m.match_order === undefined
        );
        if (matchIdx === -1) continue;
        const courtId = courtIds[slot.index % courtIds.length];
        assignments.push({
          matchIdx,
          date: slot.date,
          startTime: slot.startTime,
          endTime: calculateEndTime(slot.startTime, matchDurationMinutes),
          slotIndex: slot.index,
          courtId,
        });
        matchesPayload[matchIdx].match_date = slot.date;
        matchesPayload[matchIdx].start_time = slot.startTime;
        matchesPayload[matchIdx].end_time = calculateEndTime(slot.startTime, matchDurationMinutes);
        matchesPayload[matchIdx].court_id = courtId;
      }
    } else if (group.size === 4) {
      const matchesOrder1_2 = groupMatches
        .filter((m) => m.match_order === 1 || m.match_order === 2)
        .sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0));
      const matchesOrder3_4 = groupMatches
        .filter((m) => m.match_order === 3 || m.match_order === 4)
        .sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0));
      for (let i = 0; i < matchesOrder1_2.length && i < 2; i++) {
        const match = matchesOrder1_2[i];
        const slot = assignedSlots[i];
        if (!slot) continue;
        const matchIdx = matchesPayload.findIndex(
          (m) => m.tournament_group_id === match.tournament_group_id && m.match_order === match.match_order
        );
        if (matchIdx === -1) continue;
        const courtId = courtIds[slot.index % courtIds.length];
        assignments.push({
          matchIdx,
          date: slot.date,
          startTime: slot.startTime,
          endTime: calculateEndTime(slot.startTime, matchDurationMinutes),
          slotIndex: slot.index,
          courtId,
        });
        matchesPayload[matchIdx].match_date = slot.date;
        matchesPayload[matchIdx].start_time = slot.startTime;
        matchesPayload[matchIdx].end_time = calculateEndTime(slot.startTime, matchDurationMinutes);
        matchesPayload[matchIdx].court_id = courtId;
      }
      for (let i = 0; i < matchesOrder3_4.length && i < 2; i++) {
        const match = matchesOrder3_4[i];
        const slot = assignedSlots[i + 2];
        if (!slot) continue;
        const matchIdx = matchesPayload.findIndex(
          (m) => m.tournament_group_id === match.tournament_group_id && m.match_order === match.match_order
        );
        if (matchIdx === -1) continue;
        const courtId = courtIds[slot.index % courtIds.length];
        assignments.push({
          matchIdx,
          date: slot.date,
          startTime: slot.startTime,
          endTime: calculateEndTime(slot.startTime, matchDurationMinutes),
          slotIndex: slot.index,
          courtId,
        });
        matchesPayload[matchIdx].match_date = slot.date;
        matchesPayload[matchIdx].start_time = slot.startTime;
        matchesPayload[matchIdx].end_time = calculateEndTime(slot.startTime, matchDurationMinutes);
        matchesPayload[matchIdx].court_id = courtId;
      }
    }
  }

  if (onLog) onLog(`✅ ${assignments.length} partidos asignados exitosamente`);
  return { success: true, assignments };
}
