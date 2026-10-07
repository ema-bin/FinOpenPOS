import { computeDiscountAndTotal, roundMoney } from "@/lib/order-payment-helpers";
import { DEBT_REMINDER_TEMPLATE } from "@/templates/whatsapp/debt-reminder.template";

export type DebtReminderOrder = {
  player: { first_name: string; last_name: string } | null;
  total_amount: number;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  items?: Array<{
    quantity: number;
    unit_price: number;
    product: { name: string } | null;
  }>;
  amount_paid?: number;
  balance_due?: number;
};

export type DebtSummary = {
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
};

export function formatDebtAmount(amount: number): string {
  return `$${roundMoney(amount).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Con ítems recalcula igual que GET /api/orders/[id]; sin ítems usa total_amount. */
export function computeDebtSummary(order: DebtReminderOrder): DebtSummary {
  const items = order.items ?? [];
  let subtotal: number;
  let discount = 0;
  let total: number;

  if (items.length > 0) {
    subtotal = roundMoney(
      items.reduce((sum, i) => sum + Number(i.unit_price) * Number(i.quantity), 0)
    );
    const computed = computeDiscountAndTotal(
      subtotal,
      order.discount_percentage,
      order.discount_amount
    );
    discount = computed.discountValue;
    total = computed.finalTotal;
  } else {
    subtotal = roundMoney(Number(order.total_amount) || 0);
    total = subtotal;
  }

  const paid = roundMoney(Number(order.amount_paid) || 0);
  const balance =
    order.balance_due != null
      ? roundMoney(order.balance_due)
      : roundMoney(Math.max(0, total - paid));

  return { subtotal, discount, total, paid, balance };
}

export function buildDebtDetail(order: DebtReminderOrder): string {
  const summary = computeDebtSummary(order);
  const lines: string[] = ["*Detalle de la cuenta:*"];

  for (const item of order.items ?? []) {
    const name = item.product?.name?.trim() || "Producto";
    const lineTotal = Number(item.unit_price) * Number(item.quantity);
    lines.push(`• ${item.quantity} x ${name}: ${formatDebtAmount(lineTotal)}`);
  }

  if (summary.discount > 0) {
    lines.push(`Subtotal: ${formatDebtAmount(summary.subtotal)}`);
    lines.push(`Descuento: -${formatDebtAmount(summary.discount)}`);
  }
  lines.push(`Total: ${formatDebtAmount(summary.total)}`);
  if (summary.paid > 0) {
    lines.push(`Pagado: ${formatDebtAmount(summary.paid)}`);
  }
  lines.push(`*Saldo pendiente: ${formatDebtAmount(summary.balance)}*`);

  return lines.join("\n");
}

export function buildDebtReminderMessage(
  order: DebtReminderOrder,
  options: { includeDetail: boolean; template?: string }
): string {
  const template = options.template ?? DEBT_REMINDER_TEMPLATE;
  const firstName = order.player?.first_name?.trim() ?? "";
  const fullName = `${firstName} ${order.player?.last_name?.trim() ?? ""}`.trim();
  const { balance } = computeDebtSummary(order);
  const detail = options.includeDetail ? buildDebtDetail(order) : "";

  return template
    .replace(/\{nombre\}/gi, firstName)
    .replace(/\{nombre_completo\}/gi, fullName)
    .replace(/\{saldo\}/gi, formatDebtAmount(balance))
    .replace(/\{detalle\}/gi, detail)
    .replace(/Hola !/g, "Hola!")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
