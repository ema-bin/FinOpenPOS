export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { closeOpenOrder } from "@/lib/order-close";
import {
  buildOrderPaymentSummary,
  computeDiscountAndTotal,
  fetchOrderIncomePayments,
  isFullyPaid,
  roundMoney,
  sumPayments,
} from "@/lib/order-payment-helpers";

type RouteParams = { params: { id: string } };

async function recalcOrderTotal(
  supabase: ReturnType<typeof createClient>,
  orderId: number
) {
  const { data, error } = await supabase
    .from("order_items")
    .select("quantity, unit_price")
    .eq("order_id", orderId);

  if (error) {
    throw new Error("Error calculating order total");
  }

  const total = (data ?? []).reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const { error: updateError } = await supabase
    .from("orders")
    .update({ total_amount: total })
    .eq("id", orderId);

  if (updateError) {
    throw new Error("Error updating order total");
  }

  return total;
}

async function getOrderWithItems(
  supabase: ReturnType<typeof createClient>,
  orderId: number,
  finalTotal: number
) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `
        id,
        player_id,
        total_amount,
        discount_percentage,
        discount_amount,
        status,
        created_at,
        closed_at,
        player:player_id ( first_name, last_name )
      `
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("Order not found");
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select(
      `
        id,
        product_id,
        quantity,
        unit_price,
        product:product_id ( name )
      `
    )
    .eq("order_id", orderId);

  if (itemsError) {
    throw new Error("Error fetching order items");
  }

  const paymentSummary = await buildOrderPaymentSummary(supabase, orderId, finalTotal);

  let payment_info = null;
  if (order.status === "closed" && paymentSummary.payments.length > 0) {
    const last = paymentSummary.payments[paymentSummary.payments.length - 1];
    payment_info = {
      payment_method_id: last.payment_method_id,
      payment_method: last.payment_method,
      amount: last.amount,
    };
  }

  return {
    ...order,
    items: items ?? [],
    payment_info,
    ...paymentSummary,
  };
}

// 💰 POST /api/orders/:id/pay
// body: { paymentMethodId, amount?, discount_percentage?, discount_amount? }
// Registra un pago en dinero. Si el saldo queda en cero, cierra la cuenta.
export async function POST(request: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = Number(params.id);
  if (Number.isNaN(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const body = await request.json();
  const paymentMethodId = Number(body.paymentMethodId || body.payment_method_id);
  const amountInput =
    body.amount !== undefined && body.amount !== null
      ? Number(body.amount)
      : null;
  const discountPercentage =
    body.discount_percentage !== undefined && body.discount_percentage !== null
      ? Number(body.discount_percentage)
      : null;
  const discountAmount =
    body.discount_amount !== undefined && body.discount_amount !== null
      ? Number(body.discount_amount)
      : null;

  if (!paymentMethodId || Number.isNaN(paymentMethodId)) {
    return NextResponse.json(
      { error: "Invalid paymentMethodId" },
      { status: 400 }
    );
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, discount_percentage, discount_amount")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "open") {
      return NextResponse.json({ error: "Order is not open" }, { status: 400 });
    }

    const { count: itemCount, error: countError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);

    if (countError) {
      return NextResponse.json({ error: "Error fetching items" }, { status: 500 });
    }

    if (!itemCount || itemCount === 0) {
      return NextResponse.json(
        { error: "Cannot pay an empty order" },
        { status: 400 }
      );
    }

    const subtotal = await recalcOrderTotal(supabase, orderId);
    if (subtotal <= 0) {
      return NextResponse.json(
        { error: "Order total is zero" },
        { status: 400 }
      );
    }

    const effectiveDiscountPct =
      discountPercentage !== null && !Number.isNaN(discountPercentage)
        ? discountPercentage
        : order.discount_percentage;
    const effectiveDiscountAmt =
      discountAmount !== null && !Number.isNaN(discountAmount)
        ? discountAmount
        : order.discount_amount;

    const { discountValue, finalTotal } = computeDiscountAndTotal(
      subtotal,
      effectiveDiscountPct,
      effectiveDiscountAmt
    );

    const existingPayments = await fetchOrderIncomePayments(supabase, orderId);
    const paidSoFar = roundMoney(sumPayments(existingPayments));
    const balanceDue = roundMoney(Math.max(0, finalTotal - paidSoFar));

    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: "La cuenta ya está saldada. Podés cerrarla desde el sistema." },
        { status: 400 }
      );
    }

    const amount =
      amountInput !== null && !Number.isNaN(amountInput) && amountInput > 0
        ? roundMoney(amountInput)
        : balanceDue;

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount to charge" },
        { status: 400 }
      );
    }

    if (amount > balanceDue + 0.009) {
      return NextResponse.json(
        {
          error: `El monto no puede superar el saldo pendiente ($${balanceDue.toFixed(2)})`,
        },
        { status: 400 }
      );
    }

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

    const description =
      discountValue > 0
        ? `Pago cuenta #${orderId} (${paymentMethod.name}) - Descuento: $${discountValue.toFixed(2)}`
        : `Pago cuenta #${orderId} (${paymentMethod.name})`;

    const { error: txError } = await supabase.from("transactions").insert({
      order_id: orderId,
      payment_method_id: paymentMethodId,
      amount,
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

    const discountUpdate: Record<string, number | null> = {};
    if (discountPercentage !== null && !Number.isNaN(discountPercentage)) {
      discountUpdate.discount_percentage = discountPercentage;
    }
    if (discountAmount !== null && !Number.isNaN(discountAmount)) {
      discountUpdate.discount_amount = discountAmount;
    }
    if (Object.keys(discountUpdate).length > 0) {
      await supabase.from("orders").update(discountUpdate).eq("id", orderId);
    }

    const newPaidTotal = roundMoney(paidSoFar + amount);
    const willClose = isFullyPaid(newPaidTotal, finalTotal);

    if (willClose) {
      await closeOpenOrder(
        supabase,
        orderId,
        user.id,
        finalTotal,
        effectiveDiscountPct ?? null,
        effectiveDiscountAmt ?? null
      );
    }

    const updatedOrder = await getOrderWithItems(supabase, orderId, finalTotal);
    return NextResponse.json({
      ...updatedOrder,
      closed: willClose,
    });
  } catch (err) {
    console.error("POST /orders/:id/pay error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
