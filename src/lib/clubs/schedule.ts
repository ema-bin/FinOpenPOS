import { addDaysIso, weekdayOf } from "@/lib/class-time";

export type ClockSlot = { start: string; end: string };

export type BusinessClock = {
  timeZone: string;
  closureHour: number;
};

/** La tarea diaria corre a las 06:00 de Argentina para todos los complejos. */
export const DAILY_JOB_HOUR = 6;

/** Igual que el día de negocio histórico: 03:00 en Buenos Aires, o sea 06:00 UTC. */
export const DEFAULT_BUSINESS_CLOCK: BusinessClock = {
  timeZone: "America/Argentina/Buenos_Aires",
  closureHour: 3,
};

export function minutesOfClock(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function clockFromMinutes(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Turnos completos desde la apertura. Si el cierre es al día siguiente y el
 * complejo lo marca, el último turno puede cruzar la medianoche.
 * Con 10:00, 01:00, 90 minutos y cruce, sale la grilla de hoy.
 */
export function buildCourtSlotGrid(input: {
  openTime: string;
  closeTime: string;
  durationMinutes: number;
  overnight: boolean;
}): ClockSlot[] {
  const open = minutesOfClock(input.openTime);
  let close = minutesOfClock(input.closeTime);
  const duration = input.durationMinutes;
  if (!Number.isInteger(duration) || duration <= 0) return [];
  if (input.overnight && close <= open) close += 1440;
  if (close <= open) return [];

  const slots: ClockSlot[] = [];
  let cursor = open;
  while (cursor + duration <= close && slots.length < 48) {
    const end = cursor + duration;
    slots.push({ start: clockFromMinutes(cursor), end: clockFromMinutes(end) });
    cursor = end;
  }
  return slots;
}

export function slotOnGrid(start: string, end: string, grid: readonly ClockSlot[]): boolean {
  const startKey = start.slice(0, 5);
  const endKey = end.slice(0, 5);
  return grid.some((slot) => slot.start === startKey && slot.end === endKey);
}

export function todayInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function zonedParts(now: Date, timeZone: string): { date: string; hour: number; weekday: number } {
  const date = todayInTimeZone(now, timeZone);
  const hourText = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const hour = Number(hourText) % 24;
  return { date, hour, weekday: weekdayOf(date) };
}

/** Instante UTC en el que, en esa zona, el reloj marca esa fecha y esa hora. */
export function zonedDateTimeToUtc(date: string, hour: number, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
    const wall = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour") % 24, pick("minute"), pick("second"));
    guess -= wall - desired;
  }
  return new Date(guess);
}

export function businessDayRange(date: string, clock: BusinessClock = DEFAULT_BUSINESS_CLOCK): { start: Date; end: Date } {
  return {
    start: zonedDateTimeToUtc(date, clock.closureHour, clock.timeZone),
    end: zonedDateTimeToUtc(addDaysIso(date, 1), clock.closureHour, clock.timeZone),
  };
}

/** Fecha de negocio que está abierta en ese instante. Antes de la hora de cierre, sigue siendo ayer. */
export function currentBusinessDate(now: Date, clock: BusinessClock = DEFAULT_BUSINESS_CLOCK): string {
  const { date, hour } = zonedParts(now, clock.timeZone);
  return hour < clock.closureHour ? addDaysIso(date, -1) : date;
}

export function previousBusinessDate(now: Date, clock: BusinessClock = DEFAULT_BUSINESS_CLOCK): string {
  return addDaysIso(currentBusinessDate(now, clock), -1);
}
