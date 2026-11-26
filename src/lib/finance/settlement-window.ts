import { addDaysIso } from "@/lib/class-time";
import { todayInTimeZone, zonedDateTimeToUtc } from "@/lib/clubs/schedule";

export type SettlementRequestWindow = {
  from: string;
  to: string;
  beginDate: string;
  endDate: string;
};

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
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
