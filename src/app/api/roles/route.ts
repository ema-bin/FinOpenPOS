export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { isPermission } from "@/lib/auth/permissions";
import { parseRoleWrite } from "@/lib/auth/role-edit";

type RoleRow = {
  id: number;
  name: string;
  is_system: boolean;
  description: string | null;
  role_permissions: { permission: string }[] | null;
};

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
}

export async function GET() {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const service = createServiceClient();
    const [rolesResult, assignmentsResult, actorResult] = await Promise.all([
      service
        .from("roles")
        .select("id, name, is_system, description, role_permissions(permission)")
        .order("id"),
      service.from("user_roles").select("user_id, role_id"),
      service.from("user_roles").select("role_id").eq("user_id", auth.userId).maybeSingle(),
    ]);

    if (rolesResult.error) return NextResponse.json({ error: rolesResult.error.message }, { status: 500 });
    if (assignmentsResult.error) {
      return NextResponse.json({ error: assignmentsResult.error.message }, { status: 500 });
    }
    if (actorResult.error) return NextResponse.json({ error: actorResult.error.message }, { status: 500 });

    const counts = new Map<number, number>();
    for (const row of assignmentsResult.data ?? []) {
      const roleId = row.role_id as number;
      counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
    }

    const roles = ((rolesResult.data ?? []) as unknown as RoleRow[]).map((role) => ({
      id: role.id,
      name: role.name,
      is_system: role.is_system,
      description: role.description,
      user_count: counts.get(role.id) ?? 0,
      permissions: (role.role_permissions ?? []).map((p) => p.permission).filter(isPermission),
    }));

    return NextResponse.json({
      actorRoleId: (actorResult.data?.role_id as number | undefined) ?? null,
      roles,
    });
  } catch (error) {
    console.error("GET /api/roles error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const parsed = parseRoleWrite(await request.json().catch(() => null), { partial: false });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: created, error } = await service
      .from("roles")
      .insert({ name: parsed.value.name, is_system: false })
      .select("id, name, is_system")
      .single();

    if (error) {
      const status = isUniqueViolation(error) ? 409 : 500;
      return NextResponse.json(
        { error: status === 409 ? "Ya existe un rol con ese nombre" : error.message },
        { status }
      );
    }

    const permissions = parsed.value.permissions ?? [];
    if (permissions.length > 0) {
      const { error: permError } = await service.from("role_permissions").insert(
        permissions.map((permission) => ({ role_id: created.id, permission }))
      );
      if (permError) {
        await service.from("roles").delete().eq("id", created.id);
        return NextResponse.json({ error: permError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ...created, permissions }, { status: 201 });
  } catch (error) {
    console.error("POST /api/roles error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
