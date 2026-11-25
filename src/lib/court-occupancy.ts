import { minutesOf } from "@/lib/class-time";

export type OccupancyBlock = {
  courtId: number;
  date: string;
  start: string;
  end: string;
};

export type OccupancyCourt = {
  courtId: number;
  courtName: string;
  usedMinutes: number;
  availableMinutes: number;
  percent: number | null;
};

export type CourtOccupancy = {
  startTime: string;
  endTime: string;
  usedMinutes: number;
  availableMinutes: number;
  percent: number | null;
  courts: OccupancyCourt[];
};

/** Un turno vacío de la grilla no ocupa. Sí ocupa si se jugó, se reservó o tiene un jugador. */
export function turnUsesCourt(slot: { wasPlayed: boolean; reserved: boolean; hasPlayer: boolean }): boolean {
  return slot.wasPlayed || slot.reserved || slot.hasPlayer;
}

/** Minutos del rango. Si el fin es anterior al inicio, cruza la medianoche. Un rango de duración cero no mide nada. */
export function windowMinutes(start: string, end: string): number {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (to === from) return 0;
  return to > from ? to - from : 1440 - from + to;
}

function segments(start: string, end: string): Array<[number, number]> {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (to === from) return [];
  if (to > from) return [[from, to]];
  return [[from, 1440], [0, to]];
}

function clip(block: [number, number], window: [number, number]): [number, number] | null {
  const start = Math.max(block[0], window[0]);
  const end = Math.min(block[1], window[1]);
  return end > start ? [start, end] : null;
}

function mergedMinutes(ranges: Array<[number, number]>): number {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let used = 0;
  let cursor = -1;
  for (const [start, end] of sorted) {
    if (start >= cursor) {
      used += end - start;
      cursor = end;
    } else if (end > cursor) {
      used += end - cursor;
      cursor = end;
    }
  }
  return used;
}

function percentOf(used: number, available: number): number | null {
  if (available <= 0) return null;
  return Math.round((used * 100) / available);
}

/**
 * Tiempo ocupado sobre el horario configurado, por cancha y en total.
 * Turnos, clases y torneos que se pisan cuentan una sola vez.
 */
export function courtOccupancy(input: {
  courts: Array<{ id: number; name: string }>;
  dates: string[];
  startTime: string;
  endTime: string;
  blocks: OccupancyBlock[];
}): CourtOccupancy {
  const window = segments(input.startTime, input.endTime);
  const span = windowMinutes(input.startTime, input.endTime);
  const dates = new Set(input.dates);
  const courtIds = new Set(input.courts.map((court) => court.id));
  const byCourt = new Map<number, Array<[number, number]>>();
  for (const block of input.blocks) {
    if (!courtIds.has(block.courtId) || !dates.has(block.date)) continue;
    const pieces = segments(block.start, block.end).flatMap((piece) =>
      window.flatMap((part) => {
        const clipped = clip(piece, part);
        return clipped ? [clipped] : [];
      }),
    );
    const current = byCourt.get(block.courtId) ?? [];
    current.push(...pieces);
    byCourt.set(block.courtId, current);
  }

  const dayCount = input.dates.length;
  const courts = input.courts.map((court) => {
    const availableMinutes = span * dayCount;
    const usedMinutes = mergedMinutes(byCourt.get(court.id) ?? []);
    return {
      courtId: court.id,
      courtName: court.name,
      usedMinutes,
      availableMinutes,
      percent: percentOf(usedMinutes, availableMinutes),
    };
  });
  const usedMinutes = courts.reduce((total, court) => total + court.usedMinutes, 0);
  const availableMinutes = courts.reduce((total, court) => total + court.availableMinutes, 0);
  return {
    startTime: input.startTime.slice(0, 5),
    endTime: input.endTime.slice(0, 5),
    usedMinutes,
    availableMinutes,
    percent: percentOf(usedMinutes, availableMinutes),
    courts,
  };
}
