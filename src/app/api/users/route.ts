export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { isPermission } from "@/lib/auth/permissions";
import { parseCreateUserInput } from "@/lib/auth/create-user-input";

type RoleRow = {
  id: number;
  name: string;
  is_system: boolean;
  description: string | null;
  role_permissions: { permission: string }[] | null;
};

export async function GET() {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const service = createServiceClient();
    const [usersResult, rolesResult, assignmentsResult] = await Promise.all([
      service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      service
        .from("roles")
        .select("id, name, is_system, description, role_permissions(permission)")
        .order("id"),
      service.from("user_roles").select("user_id, role_id"),
    ]);

    if (usersResult.error) {
      return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
    }
    if (rolesResult.error) {
      return NextResponse.json({ error: rolesResult.error.message }, { status: 500 });
    }
    if (assignmentsResult.error) {
      return NextResponse.json({ error: assignmentsResult.error.message }, { status: 500 });
    }

    const roleByUser = new Map(
      (assignmentsResult.data ?? []).map((row) => [row.user_id as string, row.role_id as number])
    );

    const users = (usersResult.data.users ?? [])
      .map((user) => ({
        id: user.id,
        email: user.email ?? "",
        name:
          (user.user_metadata?.full_name as string | undefined) ||
          (user.user_metadata?.name as string | undefined) ||
          "",
        role_id: roleByUser.get(user.id) ?? null,
      }))
      .sort((a, b) => a.email.localeCompare(b.email, "es"));

    const roles = ((rolesResult.data ?? []) as unknown as RoleRow[]).map((role) => ({
      id: role.id,
      name: role.name,
      is_system: role.is_system,
      description: role.description,
      permissions: (role.role_permissions ?? []).map((p) => p.permission).filter(isPermission),
    }));

    return NextResponse.json({ currentUserId: auth.userId, users, roles });
  } catch (error) {
    console.error("GET /api/users error:", error);
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

    const parsed = parseCreateUserInput(await request.json().catch(() => null));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { email, password, name, roleId } = parsed.value;

    const service = createServiceClient();
    const { data: role, error: roleError } = await service
      .from("roles")
      .select("id")
      .eq("id", roleId)
      .maybeSingle();

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }
    if (!role) {
      return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
    }

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { full_name: name } : {},
    });

    if (createError || !created.user) {
      const message = createError?.message ?? "No se pudo crear el usuario";
      const status = /already been registered|already exists/i.test(message) ? 409 : 400;
      return NextResponse.json(
        {
          error: status === 409 ? "Ya existe un usuario con ese email" : message,
        },
        { status }
      );
    }

    const { error: assignError } = await service.from("user_roles").insert({
      user_id: created.user.id,
      role_id: roleId,
      assigned_by: auth.userId,
    });

    if (assignError) {
      await service.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    return NextResponse.json(
      { id: created.user.id, email, roleId },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
