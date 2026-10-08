export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { parseRoleWrite, validateRoleDelete, validateRoleUpdate } from "@/lib/auth/role-edit";

type RouteParams = { params: { id: string } };

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const roleId = parseId(params.id);
    if (roleId == null) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    const parsed = parseRoleWrite(await request.json().catch(() => null), { partial: true });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const [roleResult, actorResult] = await Promise.all([
      service.from("roles").select("id, is_system").eq("id", roleId).maybeSingle(),
      service.from("user_roles").select("role_id").eq("user_id", auth.userId).maybeSingle(),
    ]);
    if (roleResult.error) return NextResponse.json({ error: roleResult.error.message }, { status: 500 });
    if (!roleResult.data) return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
    if (actorResult.error) return NextResponse.json({ error: actorResult.error.message }, { status: 500 });

    const decision = validateRoleUpdate({
      isSystem: Boolean(roleResult.data.is_system),
      permissionsSent: parsed.value.permissions !== undefined,
      actorRoleId: (actorResult.data?.role_id as number | undefined) ?? null,
      roleId,
      nextPermissions: parsed.value.permissions ?? [],
    });
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });

    if (parsed.value.name !== undefined) {
      const { error } = await service.from("roles").update({ name: parsed.value.name }).eq("id", roleId);
      if (error) {
        const status = isUniqueViolation(error) ? 409 : 500;
        return NextResponse.json(
          { error: status === 409 ? "Ya existe un rol con ese nombre" : error.message },
          { status }
        );
      }
    }

    if (parsed.value.permissions !== undefined) {
      const { error: deleteError } = await service
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

      if (parsed.value.permissions.length > 0) {
        const { error: insertError } = await service.from("role_permissions").insert(
          parsed.value.permissions.map((permission) => ({ role_id: roleId, permission }))
        );
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ id: roleId, ...parsed.value });
  } catch (error) {
    console.error("PATCH /api/roles/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const roleId = parseId(params.id);
    if (roleId == null) return NextResponse.json({ error: "id inválido" }, { status: 400 });

    const service = createServiceClient();
    const [roleResult, countResult] = await Promise.all([
      service.from("roles").select("id, is_system").eq("id", roleId).maybeSingle(),
      service.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role_id", roleId),
    ]);
    if (roleResult.error) return NextResponse.json({ error: roleResult.error.message }, { status: 500 });
    if (!roleResult.data) return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
    if (countResult.error) return NextResponse.json({ error: countResult.error.message }, { status: 500 });

    const decision = validateRoleDelete({
      isSystem: Boolean(roleResult.data.is_system),
      assignedUsers: countResult.count ?? 0,
    });
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });

    const { error } = await service.from("roles").delete().eq("id", roleId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/roles/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
