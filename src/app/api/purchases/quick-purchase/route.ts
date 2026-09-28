export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import {
  resolveQuickPurchaseProduct,
  resolveQuickPurchaseSupplier,
} from "@/lib/quick-purchase-entities";
import { roundMoney } from "@/lib/order-payment-helpers";

/** Compra rápida: solo monto + método de pago → proveedor/producto "Varios". */
export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const body = await request.json();

    const paymentMethodId = Number(body.paymentMethodId ?? body.payment_method_id);
    const rawAmount = body.amount ?? body.total_amount;
    const amount = roundMoney(Number(rawAmount));
    const notesInput = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!paymentMethodId || Number.isNaN(paymentMethodId)) {
      return NextResponse.json(
        { error: "paymentMethodId is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a number greater than 0" },
        { status: 400 }
      );
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const { data: pm, error: pmError } = await supabase
      .from("payment_methods")
      .select("id, name, is_active")
      .eq("id", paymentMethodId)
      .single();

    if (pmError || !pm) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    if (!pm.is_active) {
      return NextResponse.json({ error: "Payment method is not active" }, { status: 400 });
    }

    const [supplier, product] = await Promise.all([
      resolveQuickPurchaseSupplier(repos),
      resolveQuickPurchaseProduct(repos),
    ]);

    const notes =
      notesInput.length > 0
        ? notesInput
        : "Compra rápida (sin detalle de productos)";

    const purchase = await repos.purchases.createWithItems({
      supplier_id: supplier.id,
      payment_method_id: paymentMethodId,
      notes,
      items: [
        {
          productId: product.id,
          quantity: 1,
          unitCost: amount,
        },
      ],
    });

    return NextResponse.json({
      id: purchase.id,
      supplier_id: supplier.id,
      total_amount: purchase.total_amount,
      status: purchase.status,
      payment_method_id: paymentMethodId,
      transaction_id: purchase.transaction_id,
      created_at: purchase.created_at,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/purchases/quick-purchase error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
