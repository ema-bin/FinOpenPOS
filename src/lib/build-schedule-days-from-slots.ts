import type { ScheduleDay } from "@/models/dto/tournament";

/** Normaliza hora a HH:MM (quita segundos si vienen en el string). */
export function toHHMM(timeStr: string): string {
  const s = String(timeStr).trim();
  const parts = s.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parts[1] ? parseInt(parts[1], 10) || 0 : 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type DbSlot = {
  id?: number;
  slot_date: string;
  start_time: string;
  end_time: string;
};

/**
 * Convierte slots del torneo (tournament_group_slots) a la estructura ScheduleDay
 * que usa el scheduler. Una sola fuente de verdad: los mismos slots que las restricciones.
 */
export function buildScheduleDaysFromSlots(slots: DbSlot[]): ScheduleDay[] {
  return slots.map((s) => ({
    date: s.slot_date,
    startTime: toHHMM(s.start_time),
    endTime: toHHMM(s.end_time),
  }));
}
