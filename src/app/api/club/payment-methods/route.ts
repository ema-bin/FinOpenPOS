export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { createServiceClient } from "@/lib/supabase/service";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";

const SCOPES = ["COURT", "BAR", "CLASSES", "TOURNAMENT"] as const;

export async function GET() {
  try {
    const auth = await requirePermission("users.manage", "read");
    if (!auth.ok) return auth.response;
    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const { data, error } = await service
      .from("payment_methods")
      .select("id, name, scope, is_active, is_mercadopago")
      .eq("club_id", clubId)
      .order("name", { ascending: true });
    if (missingMercadoPagoColumn(error)) {
      const plain = await service
        .from("payment_methods")
        .select("id, name, scope, is_active")
        .eq("club_id", clubId)
        .order("name", { ascending: true });
      if (plain.error) return NextResponse.json({ error: plain.error.message }, { status: 500 });
      return NextResponse.json((plain.data ?? []).map((row) => ({ ...row, is_mercadopago: false })));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => null)) as { name?: unknown; scope?: unknown } | null;
    const name = String(body?.name ?? "").trim();
    const scope = String(body?.scope ?? "").toUpperCase();
    if (!name || name.length > 50) {
      return NextResponse.json({ error: "El nombre tiene que tener entre 1 y 50 caracteres" }, { status: 400 });
    }
    if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
      return NextResponse.json({ error: "Esa lista no existe" }, { status: 400 });
    }

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const { data, error } = await service
      .from("payment_methods")
      .insert({
        name,
        scope,
        is_active: true,
        consumes_slot_credit: scope === "COURT" && /qr/i.test(name),
        user_uid: auth.userId,
        club_id: clubId,
      })
      .select("id, name, scope, is_active")
      .single();
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return NextResponse.json(
          { error: "Ese nombre ya está en esta lista. Para repetirlo en otra, corré scripts/add-club-alta.sql." },
          { status: 409 }
        );
      }
      if (/invalid input value for enum/i.test(error.message)) {
        return NextResponse.json({ error: "Falta aplicar scripts/add-club-alta.sql en la base." }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof ClubContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

function missingMercadoPagoColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /is_mercadopago/i.test(error.message ?? "");
}
