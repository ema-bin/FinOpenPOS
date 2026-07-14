/** Mes calendario YYYY-MM para agregar cierres diarios por business_date. */

export function parseYearMonth(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d{4}-\d{2}$/.test(trimmed)) return null;
  const [year, month] = trimmed.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return trimmed;
}

export function getCurrentYearMonth(ref: Date = new Date()): string {
  const year = ref.getUTCFullYear();
  const month = String(ref.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getMonthDateRange(yearMonth: string): {
  startDate: string;
  endDate: string;
  daysInMonth: number;
} {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) throw new Error("Mes inválido");
  const [year, month] = parsed.split("-").map(Number);
  const startDate = `${parsed}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${parsed}-${String(daysInMonth).padStart(2, "0")}`;
  return { startDate, endDate, daysInMonth };
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
}
