export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { validateUserActiveChange } from "@/lib/auth/role-edit";

type RouteParams = { params: { id: string } };

/** Ban largo: Supabase no tiene "desactivar para siempre"; un siglo equivale a eso. */
const BANNED = "876000h";

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
    if (typeof body?.active !== "boolean") {
      return NextResponse.json({ error: "active debe ser true o false" }, { status: 400 });
    }

    const service = createServiceClient();
    const [rolesResult, assignmentsResult] = await Promise.all([
      service.from("roles").select("id, is_system"),
      service.from("user_roles").select("user_id, role_id"),
    ]);
    if (rolesResult.error) return NextResponse.json({ error: rolesResult.error.message }, { status: 500 });
    if (assignmentsResult.error) {
      return NextResponse.json({ error: assignmentsResult.error.message }, { status: 500 });
    }

    const systemRoleIds = new Set(
      (rolesResult.data ?? []).filter((role) => role.is_system).map((role) => role.id as number)
    );
    const assignments = assignmentsResult.data ?? [];
    const currentRoleId = assignments.find((row) => row.user_id === params.id)?.role_id ?? null;

    const decision = validateUserActiveChange({
      actorId: auth.userId,
      targetId: params.id,
      active: body.active,
      targetIsSystem: currentRoleId != null && systemRoleIds.has(currentRoleId as number),
      systemAdminCount: assignments.filter((row) => systemRoleIds.has(row.role_id as number)).length,
    });
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });

    const { error } = await service.auth.admin.updateUserById(params.id, {
      ban_duration: body.active ? "none" : BANNED,
    });
    if (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ userId: params.id, active: body.active });
  } catch (error) {
    console.error("POST /api/users/[id]/status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
