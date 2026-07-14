import type { SupabaseClient } from "@supabase/supabase-js";
import { DailySalesClosuresRepository } from "@/repositories/daily-sales-closures.repository";
import { getMonthDateRange } from "@/lib/month-period";

export type MonthlySalesSnapshotPaymentMethod = {
  paymentMethodId: number | null;
  paymentMethodName: string;
  totalAmount: number;
  transactionCount: number;
};

export type MonthlySalesSnapshotProduct = {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  quantitySold: number;
  totalAmount: number;
};

export type MonthlySalesSnapshotCategory = {
  categoryId: number | null;
  categoryName: string;
  quantitySold: number;
  totalAmount: number;
};

export type MonthlySalesSnapshot = {
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  dailyClosuresCount: number;
  daysInMonth: number;
  missingBusinessDates: string[];
  totalSales: number;
  transactionsCount: number;
  ordersClosedCount: number;
  totalDiscount: number;
  zeroAmountOrdersCount: number;
  discountedOrdersCount: number;
  openOrdersCount: number;
  openOrdersTotal: number;
  includedDailyClosureIds: number[];
  byPaymentMethod: MonthlySalesSnapshotPaymentMethod[];
  byProduct: MonthlySalesSnapshotProduct[];
  byCategory: MonthlySalesSnapshotCategory[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function listDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function aggregateMonthlySalesClosure(
  supabase: SupabaseClient,
  yearMonth: string
): Promise<MonthlySalesSnapshot> {
  const { startDate, endDate, daysInMonth } = getMonthDateRange(yearMonth);
  const dailyRepo = new DailySalesClosuresRepository(supabase);

  const { data: dailyRows, error } = await supabase
    .from("daily_sales_closures")
    .select("*")
    .gte("business_date", startDate)
    .lte("business_date", endDate)
    .order("business_date", { ascending: true });

  if (error) throw new Error(error.message);

  const dailies = dailyRows ?? [];
  if (dailies.length === 0) {
    throw new Error(`No hay cierres diarios en ${yearMonth}`);
  }

  const presentDates = new Set(dailies.map((d) => d.business_date as string));
  const missingBusinessDates = listDatesInRange(startDate, endDate).filter(
    (date) => !presentDates.has(date)
  );

  let totalSales = 0;
  let transactionsCount = 0;
  let ordersClosedCount = 0;
  let totalDiscount = 0;
  let zeroAmountOrdersCount = 0;
  let discountedOrdersCount = 0;

  const paymentMap = new Map<string, MonthlySalesSnapshotPaymentMethod>();
  const productMap = new Map<number, MonthlySalesSnapshotProduct>();
  const categoryMap = new Map<string, MonthlySalesSnapshotCategory>();
  const includedDailyClosureIds: number[] = [];

  for (const daily of dailies) {
    includedDailyClosureIds.push(daily.id);
    totalSales += Number(daily.total_sales) || 0;
    transactionsCount += daily.transactions_count || 0;
    ordersClosedCount += daily.orders_closed_count || 0;
    totalDiscount += Number(daily.total_discount) || 0;
    zeroAmountOrdersCount += daily.zero_amount_orders_count || 0;
    discountedOrdersCount += daily.discounted_orders_count || 0;

    const details = await dailyRepo.findDetails(daily.id);

    for (const row of details.paymentMethods ?? []) {
      const key = row.payment_method_id?.toString() ?? "none";
      const current = paymentMap.get(key) ?? {
        paymentMethodId: row.payment_method_id,
        paymentMethodName: row.payment_method_name,
        totalAmount: 0,
        transactionCount: 0,
      };
      current.totalAmount += row.total_amount;
      current.transactionCount += row.transaction_count;
      paymentMap.set(key, current);
    }

    for (const row of details.products ?? []) {
      const current = productMap.get(row.product_id) ?? {
        productId: row.product_id,
        productName: row.product_name,
        categoryId: row.category_id,
        categoryName: row.category_name,
        quantitySold: 0,
        totalAmount: 0,
      };
      current.quantitySold += row.quantity_sold;
      current.totalAmount += row.total_amount;
      productMap.set(row.product_id, current);
    }

    for (const row of details.categories ?? []) {
      const key = row.category_id?.toString() ?? "none";
      const current = categoryMap.get(key) ?? {
        categoryId: row.category_id,
        categoryName: row.category_name,
        quantitySold: 0,
        totalAmount: 0,
      };
      current.quantitySold += row.quantity_sold;
      current.totalAmount += row.total_amount;
      categoryMap.set(key, current);
    }
  }

  const lastDaily = dailies[dailies.length - 1];

  const byPaymentMethod = Array.from(paymentMap.values())
    .map((row) => ({ ...row, totalAmount: roundMoney(row.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byProduct = Array.from(productMap.values())
    .map((row) => ({ ...row, totalAmount: roundMoney(row.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byCategory = Array.from(categoryMap.values())
    .map((row) => ({ ...row, totalAmount: roundMoney(row.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    yearMonth,
    periodStart: startDate,
    periodEnd: endDate,
    dailyClosuresCount: dailies.length,
    daysInMonth,
    missingBusinessDates,
    totalSales: roundMoney(totalSales),
    transactionsCount,
    ordersClosedCount,
    totalDiscount: roundMoney(totalDiscount),
    zeroAmountOrdersCount,
    discountedOrdersCount,
    openOrdersCount: lastDaily.open_orders_count || 0,
    openOrdersTotal: roundMoney(Number(lastDaily.open_orders_total) || 0),
    includedDailyClosureIds,
    byPaymentMethod,
    byProduct,
    byCategory,
  };
}
