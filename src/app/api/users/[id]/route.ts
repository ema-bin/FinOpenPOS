export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { validateRoleChange } from "@/lib/auth/assign-user-role";

type RouteParams = { params: { id: string } };

type RoleRow = {
  id: number;
  is_system: boolean;
  role_permissions: { permission: string }[] | null;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const targetId = params.id;
    const body = (await request.json().catch(() => null)) as { roleId?: unknown } | null;
    const roleId = Number(body?.roleId);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return NextResponse.json({ error: "roleId inválido" }, { status: 400 });
    }

    const service = createServiceClient();
    const [rolesResult, assignmentsResult] = await Promise.all([
      service.from("roles").select("id, is_system, role_permissions(permission)"),
      service.from("user_roles").select("user_id, role_id"),
    ]);

    if (rolesResult.error) {
      return NextResponse.json({ error: rolesResult.error.message }, { status: 500 });
    }
    if (assignmentsResult.error) {
      return NextResponse.json({ error: assignmentsResult.error.message }, { status: 500 });
    }

    const roles = (rolesResult.data ?? []) as unknown as RoleRow[];
    const nextRole = roles.find((role) => role.id === roleId);
    if (!nextRole) {
      return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
    }

    const assignments = assignmentsResult.data ?? [];
    const systemRoleIds = new Set(roles.filter((role) => role.is_system).map((role) => role.id));
    const currentRoleId =
      assignments.find((row) => row.user_id === targetId)?.role_id ?? null;

    const decision = validateRoleChange({
      actorId: auth.userId,
      targetId,
      currentIsSystem: currentRoleId != null && systemRoleIds.has(currentRoleId),
      systemAdminCount: assignments.filter((row) => systemRoleIds.has(row.role_id)).length,
      nextIsSystem: nextRole.is_system,
      nextPermissions: (nextRole.role_permissions ?? []).map((p) => p.permission),
    });
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: 400 });
    }

    const { error } = await service.from("user_roles").upsert(
      {
        user_id: targetId,
        role_id: roleId,
        assigned_by: auth.userId,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ userId: targetId, roleId });
  } catch (error) {
    console.error("PATCH /api/users/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
