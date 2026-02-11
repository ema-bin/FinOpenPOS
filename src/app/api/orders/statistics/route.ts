// app/api/orders/statistics/route.ts
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface OrderStatisticsItem {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  totalQuantity: number;
  totalAmount: number;
}

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');
    const productId = url.searchParams.get('productId');
    const categoryId = url.searchParams.get('categoryId');

    const p_from_date = fromDate
      ? new Date(fromDate + 'T00:00:00').toISOString()
      : null;
    const p_to_date = toDate
      ? new Date(toDate + 'T23:59:59.999').toISOString()
      : null;
    const p_product_id = productId ? Number(productId) : null;
    const p_category_id = categoryId ? Number(categoryId) : null;

    const { data: rows, error: rpcError } = await supabase.rpc(
      'order_sales_statistics',
      { p_from_date, p_to_date, p_product_id, p_category_id }
    );

    if (rpcError) {
      console.error('order_sales_statistics RPC error:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to fetch statistics' },
        { status: 500 }
      );
    }

    const statistics: OrderStatisticsItem[] = (rows ?? []).map((row: any) => ({
      productId: row.product_id,
      productName: row.product_name ?? '',
      categoryId: row.category_id ?? null,
      categoryName: row.category_name ?? null,
      totalQuantity: Number(row.total_quantity) ?? 0,
      totalAmount: Number(row.total_amount) ?? 0,
    }));

    return NextResponse.json(statistics);
  } catch (error) {
    console.error('GET /orders/statistics error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

