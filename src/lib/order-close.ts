import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeProductRecord(productField: unknown) {
  if (!productField) return null;
  return Array.isArray(productField)
    ? (productField[0] as Record<string, unknown> | undefined) ?? null
    : (productField as Record<string, unknown>);
}

type RevenueItemRow = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  product: unknown;
};

/** Cierra una cuenta abierta: quita ítems no cantina, descuenta stock y marca closed. */
export async function closeOpenOrder(
  supabase: SupabaseClient,
  orderId: number,
  userId: string,
  finalTotal: number,
  discountPercentage: number | null,
  discountAmount: number | null
): Promise<void> {
  const { data: fetchedItems, error: itemsError } = await supabase
    .from("order_items")
    .select(
      `
        id,
        quantity,
        unit_price,
        product_id,
        product:product_id (
          name,
          uses_stock,
          category_id,
          category:category_id (
            id,
            name,
            is_cantina_revenue
          )
        )
      `
    )
    .eq("order_id", orderId);

  if (itemsError) {
    throw new Error("Error fetching items to close order");
  }

  const allItems = (fetchedItems ?? []) as RevenueItemRow[];
  const nonRevenueItemIds = allItems
    .filter((item) => {
      const product = normalizeProductRecord(item.product) as {
        category?: { is_cantina_revenue?: boolean };
      } | null;
      return product?.category?.is_cantina_revenue === false;
    })
    .map((item) => item.id);

  if (nonRevenueItemIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId)
      .in("id", nonRevenueItemIds);

    if (deleteError) {
      throw new Error("Error removing special items");
    }
  }

  const revenueItems = allItems.filter((item) => {
    const product = normalizeProductRecord(item.product) as {
      category?: { is_cantina_revenue?: boolean };
    } | null;
    return product?.category?.is_cantina_revenue !== false;
  });

  type StockMovementPayload = {
    product_id: number;
    movement_type: "sale";
    quantity: number;
    unit_cost: number;
    notes: string;
    user_uid: string;
  };

  const stockMovementsPayload = revenueItems
    .map((item): StockMovementPayload | null => {
      const product = normalizeProductRecord(item.product) as { uses_stock?: boolean } | null;
      if (product && product.uses_stock === false) return null;
      return {
        product_id: item.product_id,
        movement_type: "sale",
        quantity: item.quantity,
        unit_cost: item.unit_price,
        notes: `Venta (order #${orderId})`,
        user_uid: userId,
      };
    })
    .filter((m): m is StockMovementPayload => m !== null);

  if (stockMovementsPayload.length > 0) {
    const { error: smError } = await supabase.from("stock_movements").insert(stockMovementsPayload);
    if (smError) {
      throw new Error("Error inserting stock movements");
    }
  }

  const updateData: Record<string, unknown> = {
    status: "closed",
    closed_at: new Date().toISOString(),
    total_amount: finalTotal,
  };

  if (discountPercentage !== null && !Number.isNaN(discountPercentage)) {
    updateData.discount_percentage = discountPercentage;
  }
  if (discountAmount !== null && !Number.isNaN(discountAmount)) {
    updateData.discount_amount = discountAmount;
  }

  const { error: updateOrderError } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", orderId);

  if (updateOrderError) {
    throw new Error("Error updating order status");
  }
}
