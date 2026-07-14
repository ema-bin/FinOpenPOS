import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlySalesSnapshot } from "@/lib/aggregate-monthly-sales-closure";
import type { MonthlySalesClosureDTO } from "@/models/dto/monthly-sales-closure";

type ClosureRow = {
  id: number;
  year_month: string;
  period_start: string;
  period_end: string;
  closed_at: string;
  closed_by_user_uid: string;
  daily_closures_count: number;
  days_in_month: number;
  missing_days_count: number;
  missing_business_dates: string[] | null;
  total_sales: number | string;
  orders_closed_count: number;
  transactions_count: number;
  total_discount: number | string;
  zero_amount_orders_count: number;
  discounted_orders_count: number;
  open_orders_count: number;
  open_orders_total: number | string;
  notes: string | null;
  revision_count: number;
};

function mapClosure(row: ClosureRow): MonthlySalesClosureDTO {
  return {
    id: row.id,
    year_month: row.year_month,
    period_start: row.period_start,
    period_end: row.period_end,
    closed_at: row.closed_at,
    closed_by_user_uid: row.closed_by_user_uid,
    daily_closures_count: row.daily_closures_count,
    days_in_month: row.days_in_month,
    missing_days_count: row.missing_days_count,
    missing_business_dates: row.missing_business_dates ?? [],
    total_sales: Number(row.total_sales) || 0,
    orders_closed_count: row.orders_closed_count,
    transactions_count: row.transactions_count,
    total_discount: Number(row.total_discount) || 0,
    zero_amount_orders_count: row.zero_amount_orders_count,
    discounted_orders_count: row.discounted_orders_count ?? 0,
    open_orders_count: row.open_orders_count,
    open_orders_total: Number(row.open_orders_total) || 0,
    notes: row.notes,
    revision_count: row.revision_count ?? 1,
  };
}

export class MonthlySalesClosuresRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByYearMonth(yearMonth: string): Promise<MonthlySalesClosureDTO | null> {
    const { data, error } = await this.supabase
      .from("monthly_sales_closures")
      .select("*")
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapClosure(data as ClosureRow) : null;
  }

  async list(limit = 24): Promise<MonthlySalesClosureDTO[]> {
    const { data, error } = await this.supabase
      .from("monthly_sales_closures")
      .select("*")
      .order("year_month", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapClosure(row as ClosureRow));
  }

  async findDetails(closureId: number): Promise<{
    paymentMethods: MonthlySalesClosureDTO["payment_methods"];
    products: MonthlySalesClosureDTO["products"];
    categories: MonthlySalesClosureDTO["categories"];
    includedDays: MonthlySalesClosureDTO["included_days"];
  }> {
    const [pmRes, prodRes, catRes, daysRes] = await Promise.all([
      this.supabase
        .from("monthly_sales_closure_payment_methods")
        .select("*")
        .eq("closure_id", closureId)
        .order("total_amount", { ascending: false }),
      this.supabase
        .from("monthly_sales_closure_products")
        .select("*")
        .eq("closure_id", closureId)
        .order("total_amount", { ascending: false }),
      this.supabase
        .from("monthly_sales_closure_categories")
        .select("*")
        .eq("closure_id", closureId)
        .order("total_amount", { ascending: false }),
      this.supabase
        .from("monthly_sales_closure_days")
        .select("*")
        .eq("closure_id", closureId)
        .order("business_date", { ascending: true }),
    ]);

    if (pmRes.error) throw new Error(pmRes.error.message);
    if (prodRes.error) throw new Error(prodRes.error.message);
    if (catRes.error) throw new Error(catRes.error.message);
    if (daysRes.error) throw new Error(daysRes.error.message);

    return {
      paymentMethods: (pmRes.data ?? []).map((row) => ({
        id: row.id,
        payment_method_id: row.payment_method_id,
        payment_method_name: row.payment_method_name,
        total_amount: Number(row.total_amount) || 0,
        transaction_count: row.transaction_count,
      })),
      products: (prodRes.data ?? []).map((row) => ({
        id: row.id,
        product_id: row.product_id,
        product_name: row.product_name,
        category_id: row.category_id,
        category_name: row.category_name,
        quantity_sold: row.quantity_sold,
        total_amount: Number(row.total_amount) || 0,
      })),
      categories: (catRes.data ?? []).map((row) => ({
        id: row.id,
        category_id: row.category_id,
        category_name: row.category_name,
        quantity_sold: row.quantity_sold,
        total_amount: Number(row.total_amount) || 0,
      })),
      includedDays: (daysRes.data ?? []).map((row) => ({
        id: row.id,
        daily_closure_id: row.daily_closure_id,
        business_date: row.business_date,
      })),
    };
  }

  async findWithDetails(yearMonth: string): Promise<MonthlySalesClosureDTO | null> {
    const closure = await this.findByYearMonth(yearMonth);
    if (!closure) return null;
    const details = await this.findDetails(closure.id);
    return { ...closure, ...details };
  }

  async create(
    userUid: string,
    snapshot: MonthlySalesSnapshot,
    notes?: string | null
  ): Promise<MonthlySalesClosureDTO> {
    const closureId = await this.insertHeader(userUid, snapshot, notes, 1);
    await this.insertDetails(closureId, snapshot);
    return this.findWithDetails(snapshot.yearMonth) as Promise<MonthlySalesClosureDTO>;
  }

  async replace(
    closureId: number,
    userUid: string,
    snapshot: MonthlySalesSnapshot,
    notes: string | null | undefined,
    currentRevision: number
  ): Promise<MonthlySalesClosureDTO> {
    const { error: headerError } = await this.supabase
      .from("monthly_sales_closures")
      .update({
        period_start: snapshot.periodStart,
        period_end: snapshot.periodEnd,
        closed_at: new Date().toISOString(),
        closed_by_user_uid: userUid,
        daily_closures_count: snapshot.dailyClosuresCount,
        days_in_month: snapshot.daysInMonth,
        missing_days_count: snapshot.missingBusinessDates.length,
        missing_business_dates: snapshot.missingBusinessDates,
        total_sales: snapshot.totalSales,
        orders_closed_count: snapshot.ordersClosedCount,
        transactions_count: snapshot.transactionsCount,
        total_discount: snapshot.totalDiscount,
        zero_amount_orders_count: snapshot.zeroAmountOrdersCount,
        discounted_orders_count: snapshot.discountedOrdersCount,
        open_orders_count: snapshot.openOrdersCount,
        open_orders_total: snapshot.openOrdersTotal,
        notes: notes?.trim() || null,
        revision_count: currentRevision + 1,
      })
      .eq("id", closureId);

    if (headerError) throw new Error(headerError.message);

    await this.deleteDetails(closureId);
    await this.insertDetails(closureId, snapshot);
    return this.findWithDetails(snapshot.yearMonth) as Promise<MonthlySalesClosureDTO>;
  }

  async save(
    userUid: string,
    snapshot: MonthlySalesSnapshot,
    notes?: string | null
  ): Promise<{ closure: MonthlySalesClosureDTO; replaced: boolean }> {
    const existing = await this.findByYearMonth(snapshot.yearMonth);
    if (!existing) {
      const closure = await this.create(userUid, snapshot, notes);
      return { closure, replaced: false };
    }
    const closure = await this.replace(
      existing.id,
      userUid,
      snapshot,
      notes,
      existing.revision_count ?? 1
    );
    return { closure, replaced: true };
  }

  private async insertHeader(
    userUid: string,
    snapshot: MonthlySalesSnapshot,
    notes: string | null | undefined,
    revisionCount: number
  ): Promise<number> {
    const { data: header, error: headerError } = await this.supabase
      .from("monthly_sales_closures")
      .insert({
        year_month: snapshot.yearMonth,
        period_start: snapshot.periodStart,
        period_end: snapshot.periodEnd,
        closed_by_user_uid: userUid,
        daily_closures_count: snapshot.dailyClosuresCount,
        days_in_month: snapshot.daysInMonth,
        missing_days_count: snapshot.missingBusinessDates.length,
        missing_business_dates: snapshot.missingBusinessDates,
        total_sales: snapshot.totalSales,
        orders_closed_count: snapshot.ordersClosedCount,
        transactions_count: snapshot.transactionsCount,
        total_discount: snapshot.totalDiscount,
        zero_amount_orders_count: snapshot.zeroAmountOrdersCount,
        discounted_orders_count: snapshot.discountedOrdersCount,
        open_orders_count: snapshot.openOrdersCount,
        open_orders_total: snapshot.openOrdersTotal,
        notes: notes?.trim() || null,
        revision_count: revisionCount,
      })
      .select("id")
      .single();

    if (headerError) throw new Error(headerError.message);
    return (header as { id: number }).id;
  }

  private async deleteDetails(closureId: number): Promise<void> {
    const tables = [
      "monthly_sales_closure_payment_methods",
      "monthly_sales_closure_products",
      "monthly_sales_closure_categories",
      "monthly_sales_closure_days",
    ] as const;

    for (const table of tables) {
      const { error } = await this.supabase.from(table).delete().eq("closure_id", closureId);
      if (error) throw new Error(error.message);
    }
  }

  private async insertDetails(closureId: number, snapshot: MonthlySalesSnapshot): Promise<void> {
    if (snapshot.byPaymentMethod.length > 0) {
      const { error } = await this.supabase.from("monthly_sales_closure_payment_methods").insert(
        snapshot.byPaymentMethod.map((row) => ({
          closure_id: closureId,
          payment_method_id: row.paymentMethodId,
          payment_method_name: row.paymentMethodName,
          total_amount: row.totalAmount,
          transaction_count: row.transactionCount,
        }))
      );
      if (error) throw new Error(error.message);
    }

    if (snapshot.byProduct.length > 0) {
      const { error } = await this.supabase.from("monthly_sales_closure_products").insert(
        snapshot.byProduct.map((row) => ({
          closure_id: closureId,
          product_id: row.productId,
          product_name: row.productName,
          category_id: row.categoryId,
          category_name: row.categoryName,
          quantity_sold: row.quantitySold,
          total_amount: row.totalAmount,
        }))
      );
      if (error) throw new Error(error.message);
    }

    if (snapshot.byCategory.length > 0) {
      const { error } = await this.supabase.from("monthly_sales_closure_categories").insert(
        snapshot.byCategory.map((row) => ({
          closure_id: closureId,
          category_id: row.categoryId,
          category_name: row.categoryName,
          quantity_sold: row.quantitySold,
          total_amount: row.totalAmount,
        }))
      );
      if (error) throw new Error(error.message);
    }

    if (snapshot.includedDailyClosureIds.length > 0) {
      const { data: dailyRows, error: dailyError } = await this.supabase
        .from("daily_sales_closures")
        .select("id, business_date")
        .in("id", snapshot.includedDailyClosureIds);

      if (dailyError) throw new Error(dailyError.message);

      const { error } = await this.supabase.from("monthly_sales_closure_days").insert(
        (dailyRows ?? []).map((row) => ({
          closure_id: closureId,
          daily_closure_id: row.id,
          business_date: row.business_date,
        }))
      );
      if (error) throw new Error(error.message);
    }
  }
}
