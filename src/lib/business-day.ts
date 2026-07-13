/** Día de negocio: de 06:00 UTC a 06:00 UTC del día siguiente (igual que el dashboard). */

export function getBusinessDayStart(ref: Date = new Date()): Date {
  const start = new Date(ref);
  if (ref.getUTCHours() < 6) {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  start.setUTCHours(6, 0, 0, 0);
  return start;
}

export function getCurrentBusinessDate(ref: Date = new Date()): string {
  return getBusinessDayStart(ref).toISOString().slice(0, 10);
}

/** Día de negocio que acaba de cerrar (p. ej. a las 06:00 UTC corre para el día anterior). */
export function getPreviousBusinessDate(ref: Date = new Date()): string {
  const start = getBusinessDayStart(ref);
  start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString().slice(0, 10);
}

export function getBusinessDayRange(businessDate: string): { start: Date; end: Date } {
  const start = new Date(`${businessDate}T06:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Fecha de negocio inválida");
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function formatBusinessDayLabel(businessDate: string): string {
  const { start, end } = getBusinessDayRange(businessDate);
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const from = start.toLocaleString("es-AR", opts);
  const to = end.toLocaleString("es-AR", opts);
  return `${businessDate} (${from} – ${to} UTC)`;
}
