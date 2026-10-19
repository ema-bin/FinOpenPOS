const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha de compra rápida (YYYY-MM-DD) → timestamp al mediodía UTC,
 * para que el día calendario coincida en la caja y en el listado.
 * Sin valor, la base usa el momento del alta.
 */
export function quickPurchaseCreatedAt(
  value: unknown
): { ok: true; createdAt?: string } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true };
  if (typeof value !== "string" || !DATE_ONLY.test(value.trim())) {
    return { ok: false, error: "La fecha de compra no es válida" };
  }

  const [year, month, day] = value.trim().split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return { ok: false, error: "La fecha de compra no es válida" };
  }

  return { ok: true, createdAt: utc.toISOString() };
}
