// app/api/orders/statistics/route.ts
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  summarizeDiscountedLines,
  type DiscountableLine,
  type DiscountableOrder,
} from '@/lib/discounted-sale-lines';

export interface OrderStatisticsItem {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  totalQuantity: number;
  totalAmount: number;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
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

    let ranged = supabase
      .from('order_items')
      .select('id, order:order_id!inner ( id, status )')
      .eq('order.status', 'closed');

    if (p_from_date) ranged = ranged.gte('created_at', p_from_date);
    if (p_to_date) ranged = ranged.lte('created_at', p_to_date);

    const { data: rangedRows, error: rangedError } = await ranged;
    if (rangedError) {
      console.error('order statistics items error:', rangedError);
      return NextResponse.json(
        { error: rangedError.message || 'Failed to fetch statistics' },
        { status: 500 }
      );
    }

    const orderIds = Array.from(
      new Set(
        (rangedRows ?? [])
          .map((row) => one(row.order as { id: number } | { id: number }[] | null)?.id)
          .filter((id): id is number => typeof id === 'number')
      )
    );
    const includedItemIds = new Set((rangedRows ?? []).map((row) => row.id as number));

    if (orderIds.length === 0) {
      return NextResponse.json([]);
    }

    const items: Array<{
      id: number;
      order_id: number;
      quantity: number;
      total_price: number;
      product: unknown;
      order: unknown;
    }> = [];
    for (let offset = 0; offset < orderIds.length; offset += 200) {
      const { data: chunk, error: itemsError } = await supabase
        .from('order_items')
        .select(
          `
            id,
            order_id,
            quantity,
            total_price,
            product:product_id (
              id,
              name,
              category_id,
              category:category_id ( id, name )
            ),
            order:order_id (
              id,
              total_amount,
              discount_percentage,
              discount_amount
            )
          `
        )
        .in('order_id', orderIds.slice(offset, offset + 200));

      if (itemsError) {
        console.error('order statistics lines error:', itemsError);
        return NextResponse.json(
          { error: itemsError.message || 'Failed to fetch statistics' },
          { status: 500 }
        );
      }
      items.push(...((chunk ?? []) as typeof items));
    }

    const orders = new Map<number, DiscountableOrder>();
    const lines: DiscountableLine[] = [];

    for (const raw of items ?? []) {
      const product = one(
        raw.product as
          | {
              id: number;
              name: string;
              category_id: number | null;
              category?: { id: number; name: string } | { id: number; name: string }[] | null;
            }
          | {
              id: number;
              name: string;
              category_id: number | null;
              category?: { id: number; name: string } | { id: number; name: string }[] | null;
            }[]
          | null
      );
      const category = one(product?.category);
      const order = one(
        raw.order as
          | DiscountableOrder
          | DiscountableOrder[]
          | null
      );
      if (order && !orders.has(order.id)) orders.set(order.id, order);

      const matchesProduct = p_product_id == null || product?.id === p_product_id;
      const matchesCategory =
        p_category_id == null || (product?.category_id ?? category?.id ?? null) === p_category_id;

      lines.push({
        orderId: raw.order_id as number,
        quantity: Number(raw.quantity) || 0,
        lineTotal: Number(raw.total_price) || 0,
        cantina: true,
        productId: product?.id ?? null,
        productName: product?.name ?? '',
        categoryId: category?.id ?? product?.category_id ?? null,
        categoryName: category?.name ?? null,
        includeInTotals: includedItemIds.has(raw.id as number) && matchesProduct && matchesCategory,
      });
    }

    const statistics: OrderStatisticsItem[] = summarizeDiscountedLines(
      Array.from(orders.values()),
      lines
    ).byProduct.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalQuantity: row.quantitySold,
      totalAmount: row.totalAmount,
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
