import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOrderPaymentSummary,
  computeDiscountAndTotal,
} from "@/lib/order-payment-helpers";

/** Orden con ítems suficiente para subtotal + resumen de pagos (GET y mutaciones). */
export type OrderForPaymentResponse = {
  id: number;
  status: string;
  items?: Array<{ unit_price: number; quantity: number }>;
  discount_percentage?: number | null;
  discount_amount?: number | null;
} & Record<string, unknown>;

/** Alinea la respuesta JSON con GET /api/orders/[id]: incluye payments, amount_paid, balance_due. */
export async function enrichOrderWithPaymentSummary(
  supabase: SupabaseClient,
  order: OrderForPaymentResponse
): Promise<Record<string, unknown>> {
  const items = order.items ?? [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
    0
  );

  const discountPct = order.discount_percentage ?? null;
  const discountAmt = order.discount_amount ?? null;

  const { finalTotal } = computeDiscountAndTotal(subtotal, discountPct, discountAmt);

  const paymentSummary = await buildOrderPaymentSummary(supabase, order.id, finalTotal);

  let paymentInfo: {
    payment_method_id: number | null;
    payment_method: { id: number; name: string } | null;
    amount: number;
  } | null = null;

  if (order.status === "closed" && paymentSummary.payments.length > 0) {
    const last = paymentSummary.payments[paymentSummary.payments.length - 1];
    paymentInfo = {
      payment_method_id: last.payment_method_id,
      payment_method: last.payment_method,
      amount: last.amount,
    };
  }

  return {
    ...order,
    discount_percentage: discountPct,
    discount_amount: discountAmt,
    payment_info: paymentInfo,
    ...paymentSummary,
  };
}
