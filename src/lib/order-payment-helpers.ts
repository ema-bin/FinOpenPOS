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
    discountPercentage > 0 &&
    discountPercentage <= 100
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
  discountValue = roundMoney(discountValue);
  const finalTotal = roundMoney(Math.max(0, subtotal - discountValue));
  return { discountValue, finalTotal };
}

/** Lee descuentos del body; `null` explícito limpia el valor (no usa el guardado en DB). */
export function parseDiscountBodyField(
  body: Record<string, unknown>,
  key: "discount_percentage" | "discount_amount"
): number | null | undefined {
  if (!(key in body)) return undefined;
  const raw = body[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0) return null;
  if (key === "discount_percentage" && n > 100) return null;
  return n;
}

export function resolveOrderDiscounts(
  stored: {
    discount_percentage?: number | null;
    discount_amount?: number | null;
  },
  body?: Record<string, unknown> | null
): { discountPercentage: number | null; discountAmount: number | null } {
  const pctFromBody = body
    ? parseDiscountBodyField(body, "discount_percentage")
    : undefined;
  const amtFromBody = body ? parseDiscountBodyField(body, "discount_amount") : undefined;
  return {
    discountPercentage:
      pctFromBody !== undefined ? pctFromBody : (stored.discount_percentage ?? null),
    discountAmount:
      amtFromBody !== undefined ? amtFromBody : (stored.discount_amount ?? null),
  };
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

/** Redondeo a centavos (2 decimales). Usar antes de comparar montos. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumPayments(payments: OrderPaymentRow[]): number {
  return roundMoney(payments.reduce((sum, p) => sum + p.amount, 0));
}

export function isMoneyZero(amount: number): boolean {
  return roundMoney(amount) <= 0;
}

export function isMoneyPositive(amount: number): boolean {
  return roundMoney(amount) > 0;
}

export function isMoneyGte(a: number, b: number): boolean {
  return roundMoney(a) >= roundMoney(b);
}

export function isMoneyGt(a: number, b: number): boolean {
  return roundMoney(a) > roundMoney(b);
}

export function isFullyPaid(amountPaid: number, finalTotal: number): boolean {
  return isMoneyGte(amountPaid, finalTotal);
}

/** Cuenta sin saldo pendiente: 100% descuento o ya cubierta (no confundir con “ya saldada” con plata). */
export function canCloseOrderWithoutPayment(
  balanceDue: number,
  finalTotal: number,
  paidSoFar: number
): boolean {
  if (isMoneyPositive(balanceDue)) return false;
  if (isMoneyPositive(paidSoFar) && isMoneyPositive(finalTotal)) return false;
  return isFullyPaid(paidSoFar, finalTotal);
}

export function isOrderAlreadyPaidInFull(
  balanceDue: number,
  finalTotal: number,
  paidSoFar: number
): boolean {
  return (
    isMoneyZero(balanceDue) &&
    isMoneyPositive(paidSoFar) &&
    isMoneyPositive(finalTotal)
  );
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
