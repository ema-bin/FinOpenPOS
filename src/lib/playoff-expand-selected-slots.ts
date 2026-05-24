/**
 * Expandir ventanas elegidas (slot del torneo × cancha) a franjas consecutivas
 * para cuadrar partidos de playoff (misma lógica de paso que la grilla días × canchas).
 */

import { slotIntervalMinutesForPlayoffScheduling } from "@/lib/playoff-match-duration";

export type SelectedPlayoffSchedulingWindow = {
  slotDate: string;
  startTime: string;
  endTime: string;
  courtId: number;
};

function parseDayBoundaryMinutes(timeHHMM: string): number {
  const s = String(timeHHMM).trim().substring(0, 5);
  const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);
  return (h % 24) * 60 + (m % 60);
}

function formatMinutes(m: number): string {
  const x = Math.max(0, Math.floor(m)) % (24 * 60);
  const h = Math.floor(x / 60);
  const min = x % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Una fila por partido playoff para close-groups (date + HH:MM inicio).
 * La hora de fin se calcula ahí según duración efectiva eliminatoria.
 * Orden: fecha → ventana horaria → cancha (estable tras sort).
 */
export function expandPhysicalWindowsToPlayoffSlotList(
  windows: SelectedPlayoffSchedulingWindow[],
  playoffMinutesFromDb: number
): Array<{ date: string; startTime: string; court_id: number }> {
  if (windows.length === 0) return [];
  const interval = slotIntervalMinutesForPlayoffScheduling(
    Math.max(15, playoffMinutesFromDb)
  );
  const sorted = [...windows].sort((a, b) => {
    const d = String(a.slotDate).localeCompare(String(b.slotDate));
    if (d !== 0) return d;
    const t1 = parseDayBoundaryMinutes(a.startTime);
    const t2 = parseDayBoundaryMinutes(b.startTime);
    if (t1 !== t2) return t1 - t2;
    return a.courtId - b.courtId;
  });

  const out: Array<{ date: string; startTime: string; court_id: number }> = [];

  for (const w of sorted) {
    const date = String(w.slotDate).trim().slice(0, 10);
    let startMin = parseDayBoundaryMinutes(w.startTime);
    let endMin = parseDayBoundaryMinutes(w.endTime);
    if (endMin <= startMin) endMin += 24 * 60;

    while (startMin + interval <= endMin) {
      const startHH = formatMinutes(startMin);
      out.push({
        date,
        startTime: startHH,
        court_id: w.courtId,
      });
      startMin += interval;
    }
  }

  return out;
}
