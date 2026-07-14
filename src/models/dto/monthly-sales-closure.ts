export type MonthlySalesClosurePaymentMethodDTO = {
  id: number;
  payment_method_id: number | null;
  payment_method_name: string;
  total_amount: number;
  transaction_count: number;
};

export type MonthlySalesClosureProductDTO = {
  id: number;
  product_id: number;
  product_name: string;
  category_id: number | null;
  category_name: string | null;
  quantity_sold: number;
  total_amount: number;
};

export type MonthlySalesClosureCategoryDTO = {
  id: number;
  category_id: number | null;
  category_name: string;
  quantity_sold: number;
  total_amount: number;
};

export type MonthlySalesClosureDayDTO = {
  id: number;
  daily_closure_id: number;
  business_date: string;
};

export type MonthlySalesClosureDTO = {
  id: number;
  year_month: string;
  period_start: string;
  period_end: string;
  closed_at: string;
  closed_by_user_uid: string;
  daily_closures_count: number;
  days_in_month: number;
  missing_days_count: number;
  missing_business_dates: string[];
  total_sales: number;
  orders_closed_count: number;
  transactions_count: number;
  total_discount: number;
  zero_amount_orders_count: number;
  discounted_orders_count: number;
  open_orders_count: number;
  open_orders_total: number;
  notes: string | null;
  revision_count: number;
  payment_methods?: MonthlySalesClosurePaymentMethodDTO[];
  products?: MonthlySalesClosureProductDTO[];
  categories?: MonthlySalesClosureCategoryDTO[];
  included_days?: MonthlySalesClosureDayDTO[];
};

export type MonthlySalesClosurePreviewDTO = {
  alreadyClosed: boolean;
  closure?: MonthlySalesClosureDTO;
  preview?: {
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
    byPaymentMethod: Array<{
      paymentMethodId: number | null;
      paymentMethodName: string;
      totalAmount: number;
      transactionCount: number;
    }>;
    byProduct: Array<{
      productId: number;
      productName: string;
      categoryId: number | null;
      categoryName: string | null;
      quantitySold: number;
      totalAmount: number;
    }>;
    byCategory: Array<{
      categoryId: number | null;
      categoryName: string;
      quantitySold: number;
      totalAmount: number;
    }>;
  };
};
