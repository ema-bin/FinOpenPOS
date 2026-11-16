export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { createServiceClient } from "@/lib/supabase/service";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Medio inválido" }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as { is_active?: unknown } | null;
    if (typeof body?.is_active !== "boolean") {
      return NextResponse.json({ error: "Indicá si queda activo" }, { status: 400 });
    }

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const { data, error } = await service
      .from("payment_methods")
      .update({ is_active: body.is_active })
      .eq("id", id)
      .eq("club_id", clubId)
      .select("id, name, scope, is_active")
      .maybeSingle();
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
