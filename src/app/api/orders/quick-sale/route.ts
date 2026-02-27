export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";

// POST /api/orders/quick-sale
// body: { playerId, items: [{ productId, quantity }], paymentMethodId }
// Crea una orden, agrega items y la paga en una sola transacción
export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const body = await request.json();

    const playerId = Number(body.playerId);
    const items = body.items || [];
    const paymentMethodId = Number(body.paymentMethodId);

    // Validaciones
    if (!playerId || Number.isNaN(playerId)) {
      return NextResponse.json(
        { error: "playerId is required" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (!paymentMethodId || Number.isNaN(paymentMethodId)) {
      return NextResponse.json(
        { error: "paymentMethodId is required" },
        { status: 400 }
      );
    }

    // Validar items
    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      if (!productId || Number.isNaN(productId)) {
        return NextResponse.json(
          { error: "Invalid productId in items" },
          { status: 400 }
        );
      }

      if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "Invalid quantity in items" },
          { status: 400 }
        );
      }
    }

    // 1. Buscar o crear orden
    // Primero verificar si hay una orden abierta
    const { hasOpen, orderId: existingOrderId } = await repos.orders.hasOpenOrder(playerId);
    
    let orderId: number;
    
    if (hasOpen && existingOrderId) {
      // Usar la orden existente
      orderId = existingOrderId;
      
      // Limpiar items existentes de la orden
      const existingOrder = await repos.orders.findByIdWithItems(existingOrderId);
      if (existingOrder && existingOrder.items && existingOrder.items.length > 0) {
        for (const item of existingOrder.items) {
          await repos.orderItems.delete(item.id);
        }
      }
    } else {
      // Crear nueva orden
      const newOrder = await repos.orders.create({
        playerId,
        total_amount: 0,
        status: "open",
      });
      orderId = newOrder.id;
    }

    // 2. Agregar items a la orden
    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      // Obtener precio del producto
      const product = await repos.products.findById(productId);
      if (!product) {
        return NextResponse.json(
          { error: `Product ${productId} not found` },
          { status: 404 }
        );
      }

      // Crear item
      await repos.orderItems.create({
        order_id: orderId,
        product_id: productId,
        quantity,
        unit_price: product.price,
      });
    }

    // 3. Obtener supabase y usuario (necesario para filtrar por cantina y transacción)
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 4. Misma lógica que pay: solo ítems de categoría cantina (quitar no cantina y recalcular)
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
      console.error("Error fetching items for quick-sale:", itemsError);
      return NextResponse.json(
        { error: "Error fetching order items" },
        { status: 500 }
      );
    }

    const allItems = fetchedItems ?? [];
    const nonRevenueItemIds = allItems
      .filter(
        (item: any) =>
          item.product?.category?.is_cantina_revenue === false
      )
      .map((item: any) => item.id);

    if (nonRevenueItemIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId)
        .in("id", nonRevenueItemIds);

      if (deleteError) {
        console.error("Error removing non-cantina items in quick-sale:", deleteError);
        return NextResponse.json(
          { error: "Error removing special items" },
          { status: 500 }
        );
      }
    }

    const revenueItems = allItems.filter(
      (item: any) =>
        item.product?.category?.is_cantina_revenue !== false
    );

    if (revenueItems.length === 0) {
      return NextResponse.json(
        { error: "Cannot complete quick sale: no cantina items" },
        { status: 400 }
      );
    }

    // 5. Recalcular total solo con ítems cantina
    const total = await repos.orderItems.calculateOrderTotal(orderId);
    await repos.orders.update(orderId, { total_amount: total });

    if (total <= 0) {
      return NextResponse.json(
        { error: "Order total is zero" },
        { status: 400 }
      );
    }

    // 6. Validar método de pago
    const { data: paymentMethod, error: pmError } = await supabase
      .from("payment_methods")
      .select("id, name")
      .eq("id", paymentMethodId)
      .single();

    if (pmError || !paymentMethod) {
      return NextResponse.json(
        { error: "Payment method not found" },
        { status: 404 }
      );
    }

    // 7. Crear transacción
    const { error: txError } = await supabase.from("transactions").insert({
      order_id: orderId,
      payment_method_id: paymentMethodId,
      amount: total,
      user_uid: user.id,
      type: "income",
      status: "completed",
      description: `Quick sale for order #${orderId} (${paymentMethod.name})`,
    });

    if (txError) {
      console.error("Error creating transaction:", txError);
      return NextResponse.json(
        { error: "Error creating transaction" },
        { status: 500 }
      );
    }

    // 8. Crear movimientos de stock tipo 'sale' solo para ítems de categoría cantina (igual que pay)
    const normalizeProductRecord = (productField: any) => {
      if (!productField) return null;
      return Array.isArray(productField) ? productField[0] ?? null : productField;
    };

    type StockMovementPayload = {
      product_id: number;
      movement_type: "sale";
      quantity: number;
      unit_cost: number;
      notes: string;
      user_uid: string;
    };

    const stockMovementsPayload = revenueItems
      .map((item: any) => {
        const product = normalizeProductRecord(item.product);
        if (product && product.uses_stock === false) {
          return null;
        }
        return {
          product_id: item.product_id,
          movement_type: "sale",
          quantity: item.quantity,
          unit_cost: item.unit_price,
          notes: `Quick sale (order #${orderId})`,
          user_uid: user.id,
        };
      })
      .filter((movement): movement is StockMovementPayload => movement !== null);

    const { error: smError } = await supabase
      .from("stock_movements")
      .insert(stockMovementsPayload);

    if (smError) {
      console.error("Error inserting stock movements (sale):", smError);
      return NextResponse.json(
        { error: "Error inserting stock movements" },
        { status: 500 }
      );
    }

    // 9. Marcar orden como cerrada
    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateOrderError) {
      console.error("Error updating order status:", updateOrderError);
      return NextResponse.json(
        { error: "Error updating order status" },
        { status: 500 }
      );
    }

    // 10. Devolver la orden finalizada
    const finalOrder = await repos.orders.findByIdWithItems(orderId);
    if (!finalOrder) {
      return NextResponse.json(
        { error: "Error fetching final order" },
        { status: 500 }
      );
    }

    return NextResponse.json(finalOrder, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /orders/quick-sale error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

