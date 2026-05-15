import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderPaymentRow = {
  id: number;
  amount: number;
  created_at: string;
  payment_method_id: number | null;
  payment_method: { id: number; name: string } | null;
};

export function computeDiscountAndTotal(
  subtotal: number,
  discountPercentage: number | null | undefined,
  discountAmount: number | null | undefined
): { discountValue: number; finalTotal: number } {
  let discountValue = 0;
  if (
    discountPercentage != null &&
    !Number.isNaN(discountPercentage) &&
    discountPercentage > 0
  ) {
    discountValue = (subtotal * discountPercentage) / 100;
  }
  if (
    discountAmount != null &&
    !Number.isNaN(discountAmount) &&
    discountAmount > 0
  ) {
    discountValue = discountAmount;
  }
  const finalTotal = Math.max(0, subtotal - discountValue);
  return { discountValue, finalTotal };
}

export async function fetchOrderIncomePayments(
  supabase: SupabaseClient,
  orderId: number
): Promise<OrderPaymentRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
        id,
        amount,
        created_at,
        payment_method_id,
        payment_method:payment_methods!payment_method_id (
          id,
          name
        )
      `
    )
    .eq("order_id", orderId)
    .eq("type", "income")
    .eq("status", "completed")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Error fetching order payments");
  }

  return (data ?? []).map((row) => {
    const pm = row.payment_method as { id: number; name: string } | { id: number; name: string }[] | null;
    const payment_method = Array.isArray(pm) ? pm[0] ?? null : pm;
    return {
      id: row.id as number,
      amount: Number(row.amount),
      created_at: String(row.created_at),
      payment_method_id: row.payment_method_id as number | null,
      payment_method,
    };
  });
}

export function sumPayments(payments: OrderPaymentRow[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isFullyPaid(amountPaid: number, finalTotal: number): boolean {
  return roundMoney(amountPaid) >= roundMoney(finalTotal) - 0.009;
}

export type OrderPaymentSummary = {
  payments: OrderPaymentRow[];
  amount_paid: number;
  balance_due: number;
};

export async function buildOrderPaymentSummary(
  supabase: SupabaseClient,
  orderId: number,
  finalTotal: number
): Promise<OrderPaymentSummary> {
  const payments = await fetchOrderIncomePayments(supabase, orderId);
  const amount_paid = roundMoney(sumPayments(payments));
  const balance_due = roundMoney(Math.max(0, finalTotal - amount_paid));
  return { payments, amount_paid, balance_due };
}
