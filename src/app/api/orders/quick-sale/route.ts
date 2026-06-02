export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { closeOpenOrder } from "@/lib/order-close";
import {
  computeDiscountAndTotal,
  fetchOrderIncomePayments,
  isMoneyPositive,
  resolveOrderDiscounts,
  roundMoney,
  sumPayments,
} from "@/lib/order-payment-helpers";

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

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Órden abierta reutilizable sólo si no tiene pagos registrados (anticipos parciales no aplican a venta rápida).
    const { data: openOrders, error: openErr } = await supabase
      .from("orders")
      .select("id")
      .eq("player_id", playerId)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (openErr) {
      console.error("quick-sale: list open orders", openErr);
      return NextResponse.json({ error: "Error listing open orders" }, { status: 500 });
    }

    let orderId: number | undefined;
    for (const row of openOrders ?? []) {
      const txs = await fetchOrderIncomePayments(supabase, row.id);
      const paid = roundMoney(sumPayments(txs));
      if (paid <= 0) {
        orderId = row.id;
        break;
      }
    }

    if (orderId === undefined) {
      const newOrder = await repos.orders.create({
        playerId,
        total_amount: 0,
        status: "open",
      });
      orderId = newOrder.id;
    } else {
      const existingOrder = await repos.orders.findByIdWithItems(orderId);
      if (existingOrder?.items?.length) {
        for (const item of existingOrder.items) {
          await repos.orderItems.delete(item.id);
        }
      }
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

    // 3. Misma lógica que pay: solo ítems de categoría cantina (quitar no cantina y recalcular)
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

    // 4. Subtotal (ítems cantina) y descuento
    const subtotal = roundMoney(await repos.orderItems.calculateOrderTotal(orderId));

    if (!isMoneyPositive(subtotal)) {
      return NextResponse.json(
        { error: "Order total is zero" },
        { status: 400 }
      );
    }

    const { discountPercentage, discountAmount } = resolveOrderDiscounts(
      { discount_percentage: null, discount_amount: null },
      body as Record<string, unknown>
    );

    const { discountValue, finalTotal } = computeDiscountAndTotal(
      subtotal,
      discountPercentage,
      discountAmount
    );

    // 5. Validar método de pago
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

    // 6. Cobro (omitido si el total final es $0, ej. 100% descuento)
    if (isMoneyPositive(finalTotal)) {
      const description =
        discountValue > 0
          ? `Venta rápida #${orderId} (${paymentMethod.name}) - Descuento: $${discountValue.toFixed(2)}`
          : `Venta rápida #${orderId} (${paymentMethod.name})`;

      const { error: txError } = await supabase.from("transactions").insert({
        order_id: orderId,
        payment_method_id: paymentMethodId,
        amount: finalTotal,
        user_uid: user.id,
        type: "income",
        status: "completed",
        description,
      });

      if (txError) {
        console.error("Error creating transaction:", txError);
        return NextResponse.json(
          { error: "Error creating transaction" },
          { status: 500 }
        );
      }
    }

    // 7. Cerrar cuenta (stock + estado + descuentos guardados)
    await closeOpenOrder(
      supabase,
      orderId,
      user.id,
      finalTotal,
      discountPercentage,
      discountAmount
    );

    // 8. Devolver la orden finalizada
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

