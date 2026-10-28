import { computeDiscountAndTotal, roundMoney } from "@/lib/order-payment-helpers";

export type DiscountableOrder = {
  id: number;
  total_amount: number | null;
  discount_percentage: number | null;
  discount_amount: number | null;
};

export type DiscountableLine = {
  orderId: number;
  quantity: number;
  lineTotal: number;
  cantina: boolean;
  productId: number | null;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Si es false, entra en el reparto del descuento pero no se suma al informe. */
  includeInTotals?: boolean;
};

export type DiscountedProductTotal = {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantitySold: number;
  totalAmount: number;
};

export type DiscountedCategoryTotal = {
  categoryId: number | null;
  categoryName: string;
  quantitySold: number;
  totalAmount: number;
};

/** Reparte el total cobrado entre las líneas. El resto de centavos queda en la última. */
export function allocateDiscountedAmounts(lineTotals: number[], charged: number): number[] {
  if (lineTotals.length === 0) return [];
  const subtotalCents = lineTotals.reduce((sum, line) => sum + Math.round(line * 100), 0);
  const chargedCents = Math.max(0, Math.round(charged * 100));
  if (subtotalCents <= 0) return lineTotals.map(() => 0);

  let allocated = 0;
  return lineTotals.map((line, index) => {
    if (index === lineTotals.length - 1) {
      return (chargedCents - allocated) / 100;
    }
    const share = Math.floor((Math.round(line * 100) * chargedCents) / subtotalCents);
    allocated += share;
    return share / 100;
  });
}

export function chargedAfterDiscount(order: DiscountableOrder, subtotal: number): {
  discount: number;
  charged: number;
} {
  const computed = computeDiscountAndTotal(
    subtotal,
    order.discount_percentage,
    order.discount_amount
  );
  if (computed.discountValue > 0) {
    return { discount: computed.discountValue, charged: computed.finalTotal };
  }
  const stored = roundMoney(Math.max(0, Number(order.total_amount) || 0));
  const gap = roundMoney(Math.max(0, subtotal - stored));
  if (gap > 0.005) return { discount: gap, charged: stored };
  return { discount: 0, charged: roundMoney(subtotal) };
}

export function summarizeDiscountedLines(
  orders: readonly DiscountableOrder[],
  lines: readonly DiscountableLine[]
): {
  totalDiscount: number;
  discountedOrdersCount: number;
  byProduct: DiscountedProductTotal[];
  byCategory: DiscountedCategoryTotal[];
} {
  const linesByOrder = new Map<number, DiscountableLine[]>();
  for (const line of lines) {
    const group = linesByOrder.get(line.orderId) ?? [];
    group.push(line);
    linesByOrder.set(line.orderId, group);
  }

  const productMap = new Map<number, DiscountedProductTotal>();
  const categoryMap = new Map<string, DiscountedCategoryTotal>();
  let totalDiscount = 0;
  let discountedOrdersCount = 0;

  for (const order of orders) {
    const orderLines = linesByOrder.get(order.id) ?? [];
    const subtotal = orderLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const { discount, charged } = chargedAfterDiscount(order, subtotal);
    totalDiscount += discount;
    if (discount > 0.005) discountedOrdersCount += 1;

    const allocated = allocateDiscountedAmounts(
      orderLines.map((line) => line.lineTotal),
      charged
    );

    orderLines.forEach((line, index) => {
      if (!line.cantina || line.productId == null || line.includeInTotals === false) return;
      const amount = allocated[index] ?? 0;

      const product = productMap.get(line.productId) ?? {
        productId: line.productId,
        productName: line.productName,
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        quantitySold: 0,
        totalAmount: 0,
      };
      product.quantitySold += line.quantity;
      product.totalAmount += amount;
      productMap.set(line.productId, product);

      const categoryKey = line.categoryId?.toString() ?? "none";
      const category = categoryMap.get(categoryKey) ?? {
        categoryId: line.categoryId,
        categoryName: line.categoryName ?? "Sin categoría",
        quantitySold: 0,
        totalAmount: 0,
      };
      category.quantitySold += line.quantity;
      category.totalAmount += amount;
      categoryMap.set(categoryKey, category);
    });
  }

  const byProduct = Array.from(productMap.values())
    .map((row) => ({ ...row, totalAmount: roundMoney(row.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
  const byCategory = Array.from(categoryMap.values())
    .map((row) => ({ ...row, totalAmount: roundMoney(row.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    totalDiscount: roundMoney(totalDiscount),
    discountedOrdersCount,
    byProduct,
    byCategory,
  };
}
