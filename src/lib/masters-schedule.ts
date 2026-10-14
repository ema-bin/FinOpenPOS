import type { Assignment } from "@/lib/tournament-scheduler";
import { calculateEndTime } from "@/lib/tournament-scheduler";

export type MastersScheduleSlot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
};

export type MastersScheduleMatch = {
  team1_id: number | null;
  team2_id: number | null;
};

type Busy = { date: string; start: number; end: number; courtId?: number };

function clockMinutes(value: string, asEnd: boolean): number {
  const hhmm = value.trim().slice(0, 5);
  const [hoursRaw, minutesRaw] = hhmm.split(":");
  const hours = Number(hoursRaw) || 0;
  const minutes = Number(minutesRaw) || 0;
  if (asEnd && hours === 0 && minutes === 0) return 24 * 60;
  return hours * 60 + minutes;
}

function rangesOverlap(left: Busy, date: string, start: number, end: number): boolean {
  return left.date === date && start < left.end && end > left.start;
}

/**
 * Asigna horarios a partidos con las dos parejas ya definidas.
 * No usa la lógica de primera y segunda ronda de la zona de 4.
 */
export function scheduleMastersRoundRobin(input: {
  matches: MastersScheduleMatch[];
  slots: MastersScheduleSlot[];
  courtIds: number[];
  matchDuration: number;
  teamCannotPlaySlotIds?: Map<number, Set<number>>;
  blockedCourtIdsBySlotId?: Map<number, Set<number>>;
  allowedCourtIdsBySlotId?: Map<number, Set<number>>;
  occupied?: Set<string>;
}): { success: boolean; error?: string; assignments: Assignment[] } {
  if (input.matches.length === 0) {
    return { success: false, error: "No hay partidos de Master para programar", assignments: [] };
  }
  if (input.slots.length === 0 || input.courtIds.length === 0) {
    return {
      success: false,
      error: "Faltan horarios o canchas para programar el Master",
      assignments: [],
    };
  }

  const duration = Math.max(15, input.matchDuration);
  const candidates: Array<{
    slotId: number;
    date: string;
    startTime: string;
    endTime: string;
    start: number;
    end: number;
    courtId: number;
  }> = [];

  const slots = [...input.slots].sort((a, b) => {
    const date = a.slot_date.localeCompare(b.slot_date);
    if (date !== 0) return date;
    return a.start_time.localeCompare(b.start_time);
  });

  for (const slot of slots) {
    const date = String(slot.slot_date).trim().slice(0, 10);
    const startTime = String(slot.start_time).trim().slice(0, 5);
    const start = clockMinutes(startTime, false);
    const windowEnd = clockMinutes(String(slot.end_time), true);
    if (start + duration > windowEnd) continue;
    const endTime = calculateEndTime(startTime, duration);
    const end = start + duration;
    const allowed = input.allowedCourtIdsBySlotId?.get(slot.id);
    const courts =
      allowed && allowed.size > 0 ? input.courtIds.filter((id) => allowed.has(id)) : input.courtIds;
    const blocked = input.blockedCourtIdsBySlotId?.get(slot.id);
    for (const courtId of courts) {
      if (blocked?.has(courtId)) continue;
      candidates.push({
        slotId: slot.id,
        date,
        startTime,
        endTime,
        start,
        end,
        courtId,
      });
    }
  }

  const takenKeys = new Set(input.occupied ?? []);
  const teamBusy = new Map<number, Busy[]>();
  const courtBusy: Array<Busy & { courtId: number }> = [];
  const assignments: Assignment[] = [];

  for (let matchIdx = 0; matchIdx < input.matches.length; matchIdx++) {
    const match = input.matches[matchIdx];
    if (match.team1_id == null || match.team2_id == null) {
      return {
        success: false,
        error: "Hay un partido de Master sin las dos parejas",
        assignments: [],
      };
    }
    const teamIds = [match.team1_id, match.team2_id];
    let chosen: (typeof candidates)[number] | null = null;
    let chosenIndex = -1;

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const key = `${candidate.date}|${candidate.startTime}|${candidate.courtId}`;
      if (takenKeys.has(key)) continue;
      if (
        teamIds.some((teamId) =>
          input.teamCannotPlaySlotIds?.get(teamId)?.has(candidate.slotId)
        )
      ) {
        continue;
      }
      if (
        courtBusy.some(
          (busy) =>
            busy.courtId === candidate.courtId &&
            rangesOverlap(busy, candidate.date, candidate.start, candidate.end)
        )
      ) {
        continue;
      }
      if (
        teamIds.some((teamId) =>
          (teamBusy.get(teamId) ?? []).some((busy) =>
            rangesOverlap(busy, candidate.date, candidate.start, candidate.end)
          )
        )
      ) {
        continue;
      }
      chosen = candidate;
      chosenIndex = index;
      break;
    }

    if (!chosen) {
      return {
        success: false,
        error: `No hay horario libre para todos los partidos de Master (${assignments.length} de ${input.matches.length}).`,
        assignments: [],
      };
    }

    takenKeys.add(`${chosen.date}|${chosen.startTime}|${chosen.courtId}`);
    courtBusy.push({
      date: chosen.date,
      start: chosen.start,
      end: chosen.end,
      courtId: chosen.courtId,
    });
    for (const teamId of teamIds) {
      const busy = teamBusy.get(teamId) ?? [];
      busy.push({ date: chosen.date, start: chosen.start, end: chosen.end });
      teamBusy.set(teamId, busy);
    }
    assignments.push({
      matchIdx,
      date: chosen.date,
      startTime: chosen.startTime,
      endTime: chosen.endTime,
      slotIndex: chosenIndex,
      courtId: chosen.courtId,
    });
  }

  return { success: true, assignments };
}
