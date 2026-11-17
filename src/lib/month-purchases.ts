import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIso } from "@/lib/class-time";
import { businessClockForClient } from "@/lib/clubs/load-club";
import { DEFAULT_BUSINESS_CLOCK, zonedDateTimeToUtc } from "@/lib/clubs/schedule";
import { getMonthDateRange } from "@/lib/month-period";

export type MonthPurchase = {
  id: number;
  date: string;
  supplierName: string;
  paymentMethodName: string | null;
  totalAmount: number;
};

/** Límites del mes calendario en la zona del complejo, en ISO UTC. */
export function argentinaMonthBounds(
  yearMonth: string,
  timeZone = DEFAULT_BUSINESS_CLOCK.timeZone
): { from: string; to: string } {
  const { startDate, endDate } = getMonthDateRange(yearMonth);
  const start = zonedDateTimeToUtc(startDate, 0, timeZone);
  const nextMonth = zonedDateTimeToUtc(addDaysIso(endDate, 1), 0, timeZone);
  return {
    from: start.toISOString(),
    to: new Date(nextMonth.getTime() - 1).toISOString(),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function argentinaDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Compras completadas cuya fecha cae en el mes. Las pendientes y canceladas no entran. */
export async function listCompletedPurchasesInMonth(
  supabase: SupabaseClient,
  yearMonth: string
): Promise<MonthPurchase[]> {
  const timeZone = (await businessClockForClient(supabase)).timeZone;
  const { from, to } = argentinaMonthBounds(yearMonth, timeZone);
  const { data, error } = await supabase
    .from("purchases")
    .select(
      `
      id,
      total_amount,
      created_at,
      status,
      supplier:supplier_id ( name ),
      payment_method:payment_method_id ( name )
    `
    )
    .eq("status", "completed")
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
    const method = Array.isArray(row.payment_method) ? row.payment_method[0] : row.payment_method;
    return {
      id: row.id as number,
      date: argentinaDate(row.created_at as string, timeZone),
      supplierName: (supplier as { name?: string } | null)?.name ?? "Sin proveedor",
      paymentMethodName: (method as { name?: string } | null)?.name ?? null,
      totalAmount: roundMoney(Number(row.total_amount) || 0),
    };
  });
}

export function sumPurchases(purchases: MonthPurchase[]): number {
  return roundMoney(purchases.reduce((sum, row) => sum + row.totalAmount, 0));
}
