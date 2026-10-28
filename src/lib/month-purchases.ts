import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonthDateRange } from "@/lib/month-period";

export type MonthPurchase = {
  id: number;
  date: string;
  supplierName: string;
  paymentMethodName: string | null;
  totalAmount: number;
};

/** Límites del mes calendario en Argentina, en ISO UTC. */
export function argentinaMonthBounds(yearMonth: string): { from: string; to: string } {
  const { startDate, endDate } = getMonthDateRange(yearMonth);
  return {
    from: new Date(`${startDate}T00:00:00-03:00`).toISOString(),
    to: new Date(`${endDate}T23:59:59.999-03:00`).toISOString(),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function argentinaDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
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
  const { from, to } = argentinaMonthBounds(yearMonth);
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
      date: argentinaDate(row.created_at as string),
      supplierName: (supplier as { name?: string } | null)?.name ?? "Sin proveedor",
      paymentMethodName: (method as { name?: string } | null)?.name ?? null,
      totalAmount: roundMoney(Number(row.total_amount) || 0),
    };
  });
}

export function sumPurchases(purchases: MonthPurchase[]): number {
  return roundMoney(purchases.reduce((sum, row) => sum + row.totalAmount, 0));
}
