import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDayRange, getBusinessDayStart } from "@/lib/business-day";
import { summarizeDiscountedLines, type DiscountableLine } from "@/lib/discounted-sale-lines";

export type DailySalesSnapshotPaymentMethod = {
  paymentMethodId: number | null;
  paymentMethodName: string;
  totalAmount: number;
  transactionCount: number;
};

export type DailySalesSnapshotProduct = {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantitySold: number;
  totalAmount: number;
};

export type DailySalesSnapshotCategory = {
  categoryId: number | null;
  categoryName: string;
  quantitySold: number;
  totalAmount: number;
};

export type DailySalesSnapshot = {
  businessDate: string;
  periodStart: string;
  periodEnd: string;
  totalSales: number;
  transactionsCount: number;
  ordersClosedCount: number;
  totalDiscount: number;
  zeroAmountOrdersCount: number;
  discountedOrdersCount: number;
  openOrdersCount: number;
  openOrdersTotal: number;
  byPaymentMethod: DailySalesSnapshotPaymentMethod[];
  byProduct: DailySalesSnapshotProduct[];
  byCategory: DailySalesSnapshotCategory[];
};

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isCantinaRevenue(product: {
  category?: { is_cantina_revenue?: boolean } | null;
} | null): boolean {
  return product?.category?.is_cantina_revenue !== false;
}

const ORDER_ITEMS_SELECT = `
  order_id,
  quantity,
  total_price,
  product:product_id (
    id,
    name,
    category_id,
    category:category_id ( id, name, is_cantina_revenue )
  )
`;

function mapOrderItems(items: unknown[]): DiscountableLine[] {
  return items.map((raw) => {
    const item = raw as {
      order_id: number;
      quantity: number;
      total_price: number;
      product:
        | {
            id: number;
            name: string;
            category_id: number | null;
            category?: { id: number; name: string; is_cantina_revenue?: boolean } | null;
          }
        | {
            id: number;
            name: string;
            category_id: number | null;
            category?: { id: number; name: string; is_cantina_revenue?: boolean } | null;
          }[]
        | null;
    };
    const product = normalizeJoin(item.product);
    return {
      orderId: item.order_id,
      quantity: Number(item.quantity) || 0,
      lineTotal: Number(item.total_price) || 0,
      cantina: isCantinaRevenue(product),
      productId: product?.id ?? null,
      productName: product?.name ?? "",
      categoryId: product?.category?.id ?? product?.category_id ?? null,
      categoryName: product?.category?.name ?? null,
    };
  });
}

/** Productos y categorías de la cantina, con el descuento de cada venta ya aplicado. */
export async function loadDiscountedCantinaBreakdown(
  supabase: SupabaseClient,
  businessDates: readonly string[]
): Promise<{
  byProduct: DailySalesSnapshotProduct[];
  byCategory: DailySalesSnapshotCategory[];
}> {
  if (businessDates.length === 0) return { byProduct: [], byCategory: [] };

  const sorted = [...businessDates].sort();
  const periodStart = getBusinessDayRange(sorted[0]).start.toISOString();
  const periodEnd = getBusinessDayRange(sorted[sorted.length - 1]).end.toISOString();
  const allowed = new Set(businessDates);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, closed_at, total_amount, discount_percentage, discount_amount")
    .eq("status", "closed")
    .gte("closed_at", periodStart)
    .lt("closed_at", periodEnd);

  if (error) throw new Error(error.message);

  const included = (orders ?? []).filter((order) => {
    if (!order.closed_at) return false;
    const businessDate = getBusinessDayStart(new Date(order.closed_at)).toISOString().slice(0, 10);
    return allowed.has(businessDate);
  });

  if (included.length === 0) return { byProduct: [], byCategory: [] };

  const orderIds = included.map((order) => order.id);
  const items: unknown[] = [];
  for (let offset = 0; offset < orderIds.length; offset += 200) {
    const { data: chunk, error: itemsError } = await supabase
      .from("order_items")
      .select(ORDER_ITEMS_SELECT)
      .in("order_id", orderIds.slice(offset, offset + 200));
    if (itemsError) throw new Error(itemsError.message);
    items.push(...(chunk ?? []));
  }

  const summary = summarizeDiscountedLines(included, mapOrderItems(items));
  return { byProduct: summary.byProduct, byCategory: summary.byCategory };
}

export async function computeDailySalesSnapshot(
  supabase: SupabaseClient,
  businessDate: string
): Promise<DailySalesSnapshot> {
  const { start, end } = getBusinessDayRange(businessDate);
  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();

  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select(
      `
        amount,
        payment_method_id,
        payment_method:payment_method_id ( id, name )
      `
    )
    .eq("type", "income")
    .eq("status", "completed")
    .not("order_id", "is", null)
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (txError) throw new Error(txError.message);

  const paymentMap = new Map<string, DailySalesSnapshotPaymentMethod>();
  let totalSales = 0;

  for (const tx of transactions ?? []) {
    const amount = Number(tx.amount) || 0;
    totalSales += amount;
    const pm = normalizeJoin(
      tx.payment_method as unknown as { id: number; name: string } | { id: number; name: string }[] | null
    );
    const key = pm?.id?.toString() ?? "none";
    const current = paymentMap.get(key) ?? {
      paymentMethodId: pm?.id ?? null,
      paymentMethodName: pm?.name ?? "Sin método",
      totalAmount: 0,
      transactionCount: 0,
    };
    current.totalAmount += amount;
    current.transactionCount += 1;
    paymentMap.set(key, current);
  }

  const { data: closedOrders, error: closedError } = await supabase
    .from("orders")
    .select("id, total_amount, discount_percentage, discount_amount")
    .eq("status", "closed")
    .gte("closed_at", periodStart)
    .lt("closed_at", periodEnd);

  if (closedError) throw new Error(closedError.message);

  const closedOrderIds = (closedOrders ?? []).map((o) => o.id);
  let totalDiscount = 0;
  let zeroAmountOrdersCount = 0;
  let discountedOrdersCount = 0;

  const productMap = new Map<number, DailySalesSnapshotProduct>();
  const categoryMap = new Map<string, DailySalesSnapshotCategory>();

  if (closedOrderIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select(ORDER_ITEMS_SELECT)
      .in("order_id", closedOrderIds);

    if (itemsError) throw new Error(itemsError.message);

    const lines = mapOrderItems(items ?? []);

    const summary = summarizeDiscountedLines(closedOrders ?? [], lines);
    totalDiscount = summary.totalDiscount;
    discountedOrdersCount = summary.discountedOrdersCount;
    for (const row of summary.byProduct) productMap.set(row.productId, row);
    for (const row of summary.byCategory) {
      categoryMap.set(row.categoryId?.toString() ?? "none", row);
    }

    for (const order of closedOrders ?? []) {
      if ((Number(order.total_amount) || 0) <= 0) zeroAmountOrdersCount += 1;
    }
  }

  const { data: openOrders, error: openError } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("status", "open");

  if (openError) throw new Error(openError.message);

  const openOrdersTotal = (openOrders ?? []).reduce(
    (sum, order) => sum + (Number(order.total_amount) || 0),
    0
  );

  const byPaymentMethod = Array.from(paymentMap.values())
    .map((row) => ({
      ...row,
      totalAmount: roundMoney(row.totalAmount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byProduct = Array.from(productMap.values())
    .map((row) => ({
      ...row,
      totalAmount: roundMoney(row.totalAmount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byCategory = Array.from(categoryMap.values())
    .map((row) => ({
      ...row,
      totalAmount: roundMoney(row.totalAmount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    businessDate,
    periodStart,
    periodEnd,
    totalSales: roundMoney(totalSales),
    transactionsCount: transactions?.length ?? 0,
    ordersClosedCount: closedOrders?.length ?? 0,
    totalDiscount: roundMoney(totalDiscount),
    zeroAmountOrdersCount,
    discountedOrdersCount,
    openOrdersCount: openOrders?.length ?? 0,
    openOrdersTotal: roundMoney(openOrdersTotal),
    byPaymentMethod,
    byProduct,
    byCategory,
  };
}
