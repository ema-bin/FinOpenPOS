export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { createServiceClient } from "@/lib/supabase/service";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";

function missingMercadoPagoColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /is_mercadopago/i.test(error.message ?? "");
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Medio inválido" }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as {
      is_active?: unknown;
      is_mercadopago?: unknown;
    } | null;
    const updates: { is_active?: boolean; is_mercadopago?: boolean } = {};
    if (typeof body?.is_active === "boolean") updates.is_active = body.is_active;
    if (typeof body?.is_mercadopago === "boolean") updates.is_mercadopago = body.is_mercadopago;
    if (updates.is_active === undefined && updates.is_mercadopago === undefined) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const select = updates.is_mercadopago === undefined
      ? "id, name, scope, is_active"
      : "id, name, scope, is_active, is_mercadopago";
    const { data, error } = await service
      .from("payment_methods")
      .update(updates)
      .eq("id", id)
      .eq("club_id", clubId)
      .select(select)
      .maybeSingle();
    if (missingMercadoPagoColumn(error)) {
      return NextResponse.json(
        { error: "Falta aplicar scripts/add-payment-method-mercadopago.sql" },
        { status: 503 },
      );
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No se encontró el medio" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ClubContextError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
