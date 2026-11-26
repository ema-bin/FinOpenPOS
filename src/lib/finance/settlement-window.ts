import { addDaysIso } from "@/lib/class-time";
import { todayInTimeZone, zonedDateTimeToUtc } from "@/lib/clubs/schedule";

export type SettlementRequestWindow = {
  from: string;
  to: string;
  beginDate: string;
  endDate: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 60;

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function calendarDays(from: string, to: string): number {
  let days = 1;
  let cursor = from;
  while (cursor < to) {
    cursor = addDaysIso(cursor, 1);
    days += 1;
    if (days > MAX_DAYS) return days;
  }
  return days;
}

/** Un rango elegido a mano. Mercado Pago acepta hasta 60 días y los toma enteros. */
export function settlementRangeWindow(
  from: string,
  to: string,
  timeZone: string,
): { ok: true; window: SettlementRequestWindow } | { ok: false; error: string } {
  if (!DATE.test(from) || !DATE.test(to) || from !== addDaysIso(from, 0) || to !== addDaysIso(to, 0)) {
    return { ok: false, error: "Elegí un desde y un hasta válidos." };
  }
  if (from > to) return { ok: false, error: "El desde tiene que ser anterior o igual al hasta." };
  if (calendarDays(from, to) > MAX_DAYS) {
    return { ok: false, error: "Mercado Pago acepta hasta 60 días por reporte." };
  }
  const begin = zonedDateTimeToUtc(from, 0, timeZone);
  const end = new Date(zonedDateTimeToUtc(addDaysIso(to, 1), 0, timeZone).getTime() - 1000);
  return {
    ok: true,
    window: { from, to, beginDate: stamp(begin), endDate: stamp(end) },
  };
}

/**
 * Día de calendario anterior y día de calendario en curso, de 00:00 a 23:59
 * en la zona del complejo. Mercado Pago no acepta un corte a las 03:00:
 * arma el archivo por días enteros. A las 03:00 del 27 pide el 26 y el 27.
 */
export function settlementRequestWindow(now: Date, timeZone: string): SettlementRequestWindow {
  const today = todayInTimeZone(now, timeZone);
  const yesterday = addDaysIso(today, -1);
  const begin = zonedDateTimeToUtc(yesterday, 0, timeZone);
  const end = new Date(zonedDateTimeToUtc(addDaysIso(today, 1), 0, timeZone).getTime() - 1000);
  return {
    from: yesterday,
    to: today,
    beginDate: stamp(begin),
    endDate: stamp(end),
  };
}
