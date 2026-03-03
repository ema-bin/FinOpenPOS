// Algoritmo de asignación CON restricciones horarias.
// Copia independiente del beam search para poder mejorarlo sin tocar el otro.
// Misma lógica que tournament-scheduler-beam-search pero construye y usa groupRestrictions.

import type { ScheduleDay, AvailableSchedule } from "@/models/dto/tournament";
import type { GroupMatchPayload, Assignment, SchedulerResult, TimeSlot, TournamentSlotInput } from "./tournament-scheduler";
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
  /** Cuando los slots vienen del torneo (tournament_group_slots), mismo id que can_play */
  tournamentSlotId?: number;
};

type ScheduleResult =
  | { ok: true; assignments: Map<string, string[]> }
  | { ok: false; reason: string };

type BeamSearchOptions = {
  beamWidth?: number;
  maxCandidates?: number;
  onLog?: (message: string) => void;
  /** Slots del torneo (para logging detallado cuando se usa tournamentSlotId). */
  tournamentSlots?: TournamentSlotInput[];
  /** Por equipo, IDs de slots del torneo donde NO puede jugar (can_play = false). */
  teamCannotPlaySlotIds?: Map<number, Set<number>>;
  /** Por equipo, etiqueta para logs (ej. "Larralde-Stefani"). */
  teamDisplayNames?: Map<number, string>;
  /** Por grupo (tournament_group_id), nombre de la zona (ej. "Zona E" desde tournament_groups.name). */
  groupDisplayNames?: Map<number, string>;
};

function groupLetter(groupIdx: number): string {
  if (groupIdx < 26) return String.fromCharCode(65 + groupIdx);
  return `Grupo ${groupIdx + 1}`;
}

function permutations(n: number): number[][] {
  const result: number[][] = [];
  const arr = Array.from({ length: n }, (_, i) => i);
  const permute = (start: number) => {
    if (start === n) {
      result.push([...arr]);
      return;
    }
    for (let i = start; i < n; i++) {
      [arr[start], arr[i]] = [arr[i], arr[start]];
      permute(start + 1);
      [arr[start], arr[i]] = [arr[i], arr[start]];
    }
  };
  permute(0);
  return result;
}

function getMinSlotsAvailableForGroup(
  group: Group,
  totalSlots: number,
  groupMatchRestrictions: Map<number, Map<number, Set<string>>>
): number {
  const perMatch = groupMatchRestrictions.get(group.groupId);
  if (!perMatch || perMatch.size === 0) return totalSlots;
  let min = totalSlots;
  for (let i = 0; i < group.matches.length; i++) {
    const restricted = perMatch.get(i)?.size ?? 0;
    min = Math.min(min, totalSlots - restricted);
  }
  return min;
}

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

/** Construye slots desde tournament_group_slots: un slot asignable por (slot del torneo × cancha). Mismo conjunto que can_play. */
function buildSlotsFromTournamentSlots(
  tournamentSlots: TournamentSlotInput[],
  numCourts: number
): Slot[] {
  const slots: Slot[] = [];
  let index = 0;
  const sorted = [...tournamentSlots].sort((a, b) => {
    const d = (a.slot_date || "").localeCompare(b.slot_date || "");
    if (d !== 0) return d;
    return toHHMM(a.start_time).localeCompare(toHHMM(b.start_time));
  });
  for (const ts of sorted) {
    const dateStr = String(ts.slot_date).trim().slice(0, 10);
    const startNorm = toHHMM(ts.start_time);
    const endNorm = toHHMM(ts.end_time);
    const datetime = new Date(`${dateStr}T${startNorm}:00`);
    for (let c = 0; c < numCourts; c++) {
      slots.push({
        index: index++,
        date: dateStr,
        startTime: startNorm,
        endTime: endNorm,
        datetime,
        slotId: `${ts.id}-${c}`,
        tournamentSlotId: ts.id,
      });
    }
  }
  return slots;
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

/** Bonificación cuando los slots son del mismo horario (distintas canchas). Así dejamos otros horarios libres para grupos que se asignan después. */
function sameTimeBonus(slots: Slot[]): number {
  const ids = new Set(slots.map((s) => s.tournamentSlotId).filter((id): id is number => id !== undefined));
  return ids.size === 1 ? 10000 : 0;
}

/** Bonificación cuando los slots no son consecutivos (hay al menos matchDuration entre ellos). Con una sola cancha, evita dejar solo horarios seguidos para el último grupo. */
function spreadBonus(slots: Slot[], matchDurationMs: number): number {
  if (slots.length < 2) return 0;
  const sorted = [...slots].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  let minGapMs = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapMs = sorted[i + 1].datetime.getTime() - sorted[i].datetime.getTime() - matchDurationMs;
    minGapMs = Math.min(minGapMs, gapMs);
  }
  return minGapMs >= 0 ? 10000 : 0;
}

/**
 * Candidatos: cada partido (2 equipos) solo puede ir en slots donde ambos pueden jugar.
 * matchRestrictions: matchIndex → set de slotIds prohibidos para ese partido (unión de los 2 equipos).
 * Probamos todas las permutaciones para asignar los N slots a los N partidos:
 * - Zona de 3: pueden jugar en cualquier orden (las 6 permutaciones).
 * - Zona de 4: idem, las 24 permutaciones; el match_order solo afecta al aplicar a matchesPayload.
 */
function generateCandidates(
  group: Group,
  availableSlots: Slot[],
  usedSlotIds: Set<string>,
  matchDurationMs: number,
  maxCandidates: number,
  matchRestrictions?: Map<number, Set<string>>
): Array<{ slots: Slot[]; score: number }> {
  const isAllowedForMatch = (slotId: string, matchIdx: number): boolean =>
    !matchRestrictions?.get(matchIdx)?.has(slotId);

  const freeSlots = availableSlots.filter((slot) => {
    if (usedSlotIds.has(slot.slotId)) return false;
    if (!matchRestrictions) return true;
    return group.matches.some((_, i) => isAllowedForMatch(slot.slotId, i));
  });

  if (freeSlots.length < group.size) return [];

  const candidates: Array<{ slots: Slot[]; score: number }> = [];
  const n = group.size;
  const perms = permutations(n);

  const addValidCombinations = (arr: Slot[], size: number, start: number = 0, current: Slot[] = []): void => {
    if (current.length === size) {
      const sorted = [...current].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
      if (!isValidSlotGroup(sorted, matchDurationMs, group.size)) return;
      if (matchRestrictions) {
        for (const perm of perms) {
          let ok = true;
          for (let i = 0; i < size; i++) {
            if (!isAllowedForMatch(sorted[i].slotId, perm[i])) {
              ok = false;
              break;
            }
          }
          if (ok) {
            const slotsInMatchOrder: Slot[] = [];
            for (let j = 0; j < size; j++) slotsInMatchOrder[j] = sorted[perm.indexOf(j)];
            candidates.push({
              slots: slotsInMatchOrder,
              score: scoreSlotGroup(sorted) + sameTimeBonus(sorted) + spreadBonus(sorted, matchDurationMs),
            });
            return;
          }
        }
        return;
      }
      candidates.push({
        slots: sorted,
        score: scoreSlotGroup(sorted) + sameTimeBonus(sorted) + spreadBonus(sorted, matchDurationMs),
      });
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      addValidCombinations(arr, size, i + 1, current);
      current.pop();
    }
  };
  addValidCombinations(freeSlots, n);

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxCandidates);
}

/**
 * Fallback solo para la última zona: asigna N slots libres aunque no respeten descanso,
 * para que el usuario pueda editar manualmente después.
 */
function generateLastZoneFallback(
  group: Group,
  availableSlots: Slot[],
  usedSlotIds: Set<string>,
  matchRestrictions?: Map<number, Set<string>>
): { slots: Slot[]; score: number } | null {
  const isAllowedForMatch = (slotId: string, matchIdx: number): boolean =>
    !matchRestrictions?.get(matchIdx)?.has(slotId);

  const freeSlots = availableSlots
    .filter((slot) => !usedSlotIds.has(slot.slotId))
    .filter((slot) =>
      !matchRestrictions ? true : group.matches.some((_, i) => isAllowedForMatch(slot.slotId, i))
    )
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

  if (freeSlots.length < group.size) return null;

  const n = group.size;
  const chosen: Slot[] = [];
  const used = new Set<number>();

  for (let matchIdx = 0; matchIdx < n; matchIdx++) {
    let idx = -1;
    for (let i = 0; i < freeSlots.length; i++) {
      if (used.has(i)) continue;
      if (matchRestrictions && !isAllowedForMatch(freeSlots[i].slotId, matchIdx)) continue;
      idx = i;
      break;
    }
    if (idx === -1) {
      for (let i = 0; i < freeSlots.length; i++) {
        if (used.has(i)) continue;
        idx = i;
        break;
      }
    }
    if (idx === -1) return null;
    used.add(idx);
    chosen.push(freeSlots[idx]);
  }

  const slotsInMatchOrder = chosen;
  return { slots: slotsInMatchOrder, score: -1e6 };
}

function runBeamSearch(
  groups: Group[],
  slots: Slot[],
  matchDurationMs: number,
  groupMatchRestrictions: Map<number, Map<number, Set<string>>>,
  options?: BeamSearchOptions
): ScheduleResult {
  const beamWidth = options?.beamWidth ?? 5;
  const maxCandidates = options?.maxCandidates ?? 20;
  const onLog = options?.onLog;
  const tournamentSlots = options?.tournamentSlots;
  const teamCannotPlaySlotIds = options?.teamCannotPlaySlotIds;
  const teamDisplayNames = options?.teamDisplayNames;
  const groupDisplayNames = options?.groupDisplayNames;
  const totalSlots = slots.length;
  const groupLabel = (group: Group, groupIdx: number) =>
    groupDisplayNames?.get(group.groupId) ?? groupLetter(groupIdx);
  let states: State[] = [{ usedSlots: new Set(), assignments: new Map(), score: 0 }];

  for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
    const group = groups[groupIdx];
    const newStates: State[] = [];
    const matchRestrictions = groupMatchRestrictions.get(group.groupId);
    const groupName = groupLabel(group, groupIdx);

    const isLastZone = groupIdx === groups.length - 1;

    for (const state of states) {
      let candidates = generateCandidates(
        group,
        slots,
        state.usedSlots,
        matchDurationMs,
        maxCandidates,
        matchRestrictions
      );
      if (candidates.length === 0 && isLastZone) {
        const fallback = generateLastZoneFallback(group, slots, state.usedSlots, matchRestrictions);
        if (fallback) {
          candidates = [fallback];
          if (onLog) onLog(`⚠️ ${groupName} (última zona): sin combinación que respete descanso; se asignaron horarios para que puedas editar manualmente.`);
        }
      }
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
      const usedSlotIds = states[0]?.usedSlots ?? new Set<string>();
      const usedCount = usedSlotIds.size;
      const freeCount = totalSlots - usedCount;
      const reason = `No se pudo asignar slots para ${groupName} (id ${group.groupId}).`;
      if (onLog) {
        onLog(`❌ ${groupName} (id ${group.groupId}): no se pudo asignar horarios`);
        onLog(`   Slots totales: ${totalSlots} | Usados por otros grupos: ${usedCount} | Libres: ${freeCount}`);
        const perMatch: string[] = [];
        for (let i = 0; i < group.matches.length; i++) {
          const restricted = matchRestrictions?.get(i);
          let count = 0;
          for (const slot of slots) {
            if (usedSlotIds.has(slot.slotId)) continue;
            if (restricted?.has(slot.slotId)) continue;
            count++;
          }
          perMatch.push(`partido ${i + 1}: ${count} libres y permitidos`);
        }
        onLog(`   Por partido (libres y permitidos para los 2 equipos): ${perMatch.join(", ")}`);
        if (freeCount > 0) {
          onLog(`   → Con ${freeCount} slot(s) libre(s) puede no existir una combinación que respete el descanso entre partidos. Probá intercambiar equipos de zona o liberar más horarios.`);
        }
        // Debug adicional: para entender mejor por qué no hay solución,
        // listar para cada equipo del grupo en qué slots del torneo SÍ puede jugar.
        if (tournamentSlots && teamCannotPlaySlotIds) {
          onLog(`   Detalle por equipo (slots del torneo que SÍ puede jugar cada uno):`);
          for (const teamId of group.teams) {
            const label = teamDisplayNames?.get(teamId) ?? `Equipo ${teamId}`;
            const cannotSet = teamCannotPlaySlotIds.get(teamId) ?? new Set<number>();
            const playable = tournamentSlots.filter((ts) => !cannotSet.has(ts.id));
            const playableSummary =
              playable.length === 0
                ? "0 slots"
                : `${playable.length} slots: ` +
                  playable
                    .map(
                      (ts) =>
                        `${ts.slot_date} ${toHHMM(ts.start_time)}-${toHHMM(ts.end_time)}`
                    )
                    .join(", ");
            onLog(`   - ${label}: ${playableSummary}`);
          }
        }
      }
      return { ok: false, reason };
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
 * Algoritmo con restricciones horarias.
 * Un solo conjunto de slots:
 * - Modo tournament slots: slots = tournament_group_slots (× canchas), restricciones por slot id (can_play).
 * - Modo legacy: slots generados desde days + matchDuration, restricciones por ventanas de tiempo.
 */
export async function scheduleGroupMatchesWithRestrictions(
  matchesPayload: GroupMatchPayload[],
  days: ScheduleDay[],
  matchDurationMinutes: number,
  courtIds: number[],
  availableSchedules?: AvailableSchedule[],
  teamRestrictions?: Map<number, Array<{ date: string; start_time: string; end_time: string }>>,
  onLog?: (message: string) => void,
  tournamentSlots?: TournamentSlotInput[],
  teamCannotPlaySlotIds?: Map<number, Set<number>>,
  teamDisplayNames?: Map<number, string>,
  groupDisplayNames?: Map<number, string>
): Promise<SchedulerResult> {
  const useTournamentSlots =
    tournamentSlots != null &&
    tournamentSlots.length > 0 &&
    teamCannotPlaySlotIds != null;

  if (onLog) {
    onLog("🧩 Algoritmo con restricciones horarias: Iniciando...");
    onLog(useTournamentSlots ? "📅 Usando slots del torneo (mismo conjunto que restricciones can_play)" : "📋 Procesando grupos de 3 y 4");
  }

  if (!courtIds.length) {
    return { success: false, error: "Configuración de canchas inválida", assignments: [] };
  }
  if (!useTournamentSlots && (!days.length || !days)) {
    return { success: false, error: "Configuración de horarios inválida", assignments: [] };
  }
  if (useTournamentSlots && !tournamentSlots?.length) {
    return { success: false, error: "No hay slots del torneo", assignments: [] };
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
    // Zona de 4: orden fijo por match_order (1,2,3,4). Zona de 3: cualquier orden (se usan permutaciones al asignar).
    const matchesOrdered =
      groupSize === 4 ? [...matches].sort((a, b) => (a.match_order ?? 0) - (b.match_order ?? 0)) : matches;
    groups.push({ groupId, matches: matchesOrdered, teams: Array.from(teams), size: groupSize });
  }

  if (groups.length === 0) {
    return { success: false, error: "No se encontraron grupos válidos (de 3 o 4) para programar", assignments: [] };
  }

  const groupsOf3 = groups.filter((g) => g.size === 3).length;
  const groupsOf4 = groups.filter((g) => g.size === 4).length;
  if (onLog) onLog(`📊 Encontrados ${groups.length} grupos: ${groupsOf3} de 3, ${groupsOf4} de 4`);

  let slots: Slot[];
  const groupMatchRestrictions = new Map<number, Map<number, Set<string>>>();

  if (useTournamentSlots && tournamentSlots && teamCannotPlaySlotIds) {
    slots = buildSlotsFromTournamentSlots(tournamentSlots, courtIds.length);
    if (onLog) onLog(`📅 Slots del torneo: ${tournamentSlots.length} × ${courtIds.length} canchas = ${slots.length} asignables`);
    for (const group of groups) {
      const perMatch = new Map<number, Set<string>>();
      for (let i = 0; i < group.matches.length; i++) {
        const m = group.matches[i];
        const team1 = m.team1_id ?? 0;
        const team2 = m.team2_id ?? 0;
        const cannot1 = teamCannotPlaySlotIds.get(team1);
        const cannot2 = teamCannotPlaySlotIds.get(team2);
        const restrictedSlotIds = new Set<string>();
        for (const slot of slots) {
          if (slot.tournamentSlotId == null) continue;
          if (cannot1?.has(slot.tournamentSlotId) || cannot2?.has(slot.tournamentSlotId)) {
            restrictedSlotIds.add(slot.slotId);
          }
        }
        perMatch.set(i, restrictedSlotIds);
      }
      groupMatchRestrictions.set(group.groupId, perMatch);
    }
  } else {
    const timeSlots = generateTimeSlots(days!, matchDurationMinutes, courtIds.length, availableSchedules);
    if (onLog) onLog(`📅 Total de slots generados: ${timeSlots.length}`);
    const requiredSlots = groups.reduce((sum, g) => sum + g.size, 0);
    if (timeSlots.length < requiredSlots) {
      return {
        success: false,
        error: `No hay suficientes slots. Necesito ${requiredSlots} pero hay ${timeSlots.length}.`,
        assignments: [],
      };
    }
    slots = timeSlots.map((ts, idx) => timeSlotToSlot(ts, idx));
    slots.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
    if (teamRestrictions?.size) {
      for (const group of groups) {
        const perMatch = new Map<number, Set<string>>();
        for (let i = 0; i < group.matches.length; i++) {
          const m = group.matches[i];
          const team1 = m.team1_id ?? 0;
          const team2 = m.team2_id ?? 0;
          const restrictedSlotIds = new Set<string>();
          for (const slot of slots) {
            const timeSlot: TimeSlot = { date: slot.date, startTime: slot.startTime, endTime: slot.endTime };
            const r1 = slotViolatesRestriction(timeSlot, teamRestrictions.get(team1));
            const r2 = slotViolatesRestriction(timeSlot, teamRestrictions.get(team2));
            if (r1 || r2) restrictedSlotIds.add(slot.slotId);
          }
          perMatch.set(i, restrictedSlotIds);
        }
        groupMatchRestrictions.set(group.groupId, perMatch);
      }
    }
  }

  const requiredSlots = groups.reduce((sum, g) => sum + g.size, 0);
  if (slots.length < requiredSlots) {
    return {
      success: false,
      error: `No hay suficientes slots. Necesito ${requiredSlots} pero hay ${slots.length}.`,
      assignments: [],
    };
  }

  const totalSlots = slots.length;
  groups.sort((a, b) => {
    const minA = getMinSlotsAvailableForGroup(a, totalSlots, groupMatchRestrictions);
    const minB = getMinSlotsAvailableForGroup(b, totalSlots, groupMatchRestrictions);
    return minA - minB;
  });

  if (onLog) {
    const orderDesc = groups
      .map((g, i) => {
        const minAvailable = getMinSlotsAvailableForGroup(g, totalSlots, groupMatchRestrictions);
        const perMatch = groupMatchRestrictions.get(g.groupId);
        const detail =
          perMatch && perMatch.size > 0
            ? Array.from({ length: g.matches.length }, (_, j) => {
                const r = perMatch.get(j)?.size ?? 0;
                return totalSlots - r;
              }).join("/")
            : null;
        const extra = detail != null ? ` [partidos: ${detail}]` : "";
        const zoneName = groupDisplayNames?.get(g.groupId) ?? groupLetter(i);
        return `${zoneName} (id ${g.groupId}, mín ${minAvailable}${extra})`;
      })
      .join(", ");
    onLog(`📌 Orden de asignación (menos slots por partido primero): ${orderDesc}`);
  }

  const matchDurationMs = matchDurationMinutes * 60 * 1000;
  const result = runBeamSearch(groups, slots, matchDurationMs, groupMatchRestrictions, {
    beamWidth: 10,
    maxCandidates: 30,
    onLog,
    ...(teamDisplayNames ? { teamDisplayNames } : {}),
    ...(groupDisplayNames ? { groupDisplayNames } : {}),
    ...(useTournamentSlots && tournamentSlots && teamCannotPlaySlotIds
      ? { tournamentSlots, teamCannotPlaySlotIds }
      : {}),
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
      .filter((s): s is Slot => s !== undefined);
    // No ordenar: assignedSlots[i] corresponde al partido group.matches[i]

    for (let i = 0; i < group.size; i++) {
      const match = group.matches[i];
      const slot = assignedSlots[i];
      if (!slot) continue;
      const matchIdx =
        group.size === 3
          ? matchesPayload.findIndex(
              (m) =>
                m.tournament_group_id === match.tournament_group_id &&
                m.team1_id === match.team1_id &&
                m.team2_id === match.team2_id &&
                m.match_order === undefined
            )
          : matchesPayload.findIndex(
              (m) => m.tournament_group_id === match.tournament_group_id && m.match_order === match.match_order
            );
      if (matchIdx === -1) continue;
      const courtId = courtIds[slot.index % courtIds.length];
      const endTime = slot.endTime || calculateEndTime(slot.startTime, matchDurationMinutes);
      assignments.push({
        matchIdx,
        date: slot.date,
        startTime: slot.startTime,
        endTime,
        slotIndex: slot.index,
        courtId,
      });
      matchesPayload[matchIdx].match_date = slot.date;
      matchesPayload[matchIdx].start_time = slot.startTime;
      matchesPayload[matchIdx].end_time = endTime;
      matchesPayload[matchIdx].court_id = courtId;
    }
  }

  if (onLog) onLog(`✅ ${assignments.length} partidos asignados exitosamente`);
  return { success: true, assignments };
}
