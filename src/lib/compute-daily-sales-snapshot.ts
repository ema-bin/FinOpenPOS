import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDayRange } from "@/lib/business-day";

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
      .select(
        `
          order_id,
          quantity,
          total_price,
          product:product_id (
            id,
            name,
            category_id,
            category:category_id ( id, name, is_cantina_revenue )
          )
        `
      )
      .in("order_id", closedOrderIds);

    if (itemsError) throw new Error(itemsError.message);

    const subtotalByOrder = new Map<number, number>();

    for (const item of items ?? []) {
      const product = normalizeJoin(
        item.product as unknown as
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
          | null
      );
      if (!isCantinaRevenue(product)) continue;

      const orderId = item.order_id as number;
      const lineTotal = Number(item.total_price) || 0;
      const quantity = Number(item.quantity) || 0;
      subtotalByOrder.set(orderId, (subtotalByOrder.get(orderId) ?? 0) + lineTotal);

      if (!product) continue;

      const existingProduct = productMap.get(product.id) ?? {
        productId: product.id,
        productName: product.name,
        categoryId: product.category_id ?? product.category?.id ?? null,
        categoryName: product.category?.name ?? null,
        quantitySold: 0,
        totalAmount: 0,
      };
      existingProduct.quantitySold += quantity;
      existingProduct.totalAmount += lineTotal;
      productMap.set(product.id, existingProduct);

      const categoryId = product.category?.id ?? product.category_id ?? null;
      const categoryKey = categoryId?.toString() ?? "none";
      const existingCategory = categoryMap.get(categoryKey) ?? {
        categoryId,
        categoryName: product.category?.name ?? "Sin categoría",
        quantitySold: 0,
        totalAmount: 0,
      };
      existingCategory.quantitySold += quantity;
      existingCategory.totalAmount += lineTotal;
      categoryMap.set(categoryKey, existingCategory);
    }

    for (const order of closedOrders ?? []) {
      const subtotal = subtotalByOrder.get(order.id) ?? 0;
      const finalTotal = Number(order.total_amount) || 0;
      const explicitDiscount = Number(order.discount_amount) || 0;
      const pctDiscount = Number(order.discount_percentage) || 0;
      const discount =
        explicitDiscount > 0
          ? explicitDiscount
          : pctDiscount > 0
          ? (subtotal * pctDiscount) / 100
          : Math.max(0, subtotal - finalTotal);
      totalDiscount += discount;
      if (discount > 0.005) discountedOrdersCount += 1;
      if (finalTotal <= 0) zeroAmountOrdersCount += 1;
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
