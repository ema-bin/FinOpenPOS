import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";
import type { Permission } from "@/lib/auth/permissions";

export type PermissionCheck =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** Sesión verificada contra Auth y permiso leído de la DB (RLS: solo el rol propio). */
export async function requirePermission(permission: Permission): Promise<PermissionCheck> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const permissions = await loadRolePermissions(supabase, user.id);
  if (!permissions?.includes(permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No tenés permiso para esto." }, { status: 403 }),
    };
  }

  return { ok: true, userId: user.id };
}
