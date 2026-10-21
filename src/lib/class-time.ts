/** Horarios de clase. Las fechas YYYY-MM-DD se comparan como texto. */

export const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const CLASS_DURATION_MINUTES = 60;

/** El calendario semanal va de 06:00 a 00:00. */
export const CLASS_GRID_START_MINUTES = 6 * 60;
export const CLASS_GRID_END_MINUTES = 24 * 60;

/** La clase dura una hora y tiene que cerrar dentro de ese rango. */
export function classFitsInDay(start: string, durationMinutes = CLASS_DURATION_MINUTES): boolean {
  const startMin = minutesOf(start);
  return startMin >= CLASS_GRID_START_MINUTES && startMin + durationMinutes <= CLASS_GRID_END_MINUTES;
}

/** Acerca un clic del calendario a un horario de media hora, entre 06:00 y 23:00. */
export function snapClassStart(minutesFromMidnight: number): string {
  const snapped = Math.round(minutesFromMidnight / 30) * 30;
  const clamped = Math.min(23 * 60, Math.max(CLASS_GRID_START_MINUTES, snapped));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/** Cupo de una clase. En el calendario, los lugares que sobran se muestran como "N libres". */
export const CLASS_PLAYER_LIMIT = 5;

export function freeClassSpots(playerCount: number): number {
  return Math.max(0, CLASS_PLAYER_LIMIT - playerCount);
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Minutos desde medianoche. Acepta HH:MM y HH:MM:SS. */
export function minutesOf(time: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return `${pad2(hours)}:${pad2(mins)}:00`;
}

export function formatTimeShort(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

export function endTimeAfter(start: string, durationMinutes: number): string {
  const total = minutesOf(start) + durationMinutes;
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${pad2(hours)}:${pad2(mins)}:00`;
}

export type TimeRange = { start: string; end: string };

/** Se tocan en el borde sin superponerse. Si el fin es menor que el inicio, cruza medianoche. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const startA = minutesOf(a.start);
  let endA = minutesOf(a.end);
  const startB = minutesOf(b.start);
  let endB = minutesOf(b.end);
  if (endA <= startA) endA += 24 * 60;
  if (endB <= startB) endB += 24 * 60;
  return startA < endB && startB < endA;
}

export function weekdayOf(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length <= 370) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isYearMonth(value: string): boolean {
  return monthBounds(value) !== null;
}

export function monthBounds(yearMonth: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(year, month, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${pad2(last)}` };
}

export function enrollmentCovers(startedOn: string, endedOn: string | null, date: string): boolean {
  if (startedOn > date) return false;
  if (endedOn && endedOn < date) return false;
  return true;
}

function weekStartMonday(isoDate: string): string {
  const weekday = weekdayOf(isoDate);
  const offset = weekday === 0 ? 6 : weekday - 1;
  return addDaysIso(isoDate, -offset);
}

/**
 * Roster de un día de clase. Si la persona entra a mitad de semana, igual figura
 * en el día fijo de esa misma semana (por ejemplo, alta el miércoles y la clase es el martes).
 */
export function enrollmentOnClassDay(startedOn: string, endedOn: string | null, sessionDate: string): boolean {
  if (endedOn && endedOn < sessionDate) return false;
  if (startedOn <= sessionDate) return true;
  return weekStartMonday(startedOn) === weekStartMonday(sessionDate);
}

export function todayInArgentina(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
