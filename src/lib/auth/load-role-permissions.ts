import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectivePermissions, type Permission } from "./permissions";

type RoleEmbed = {
  is_system: boolean;
  role_permissions: { permission: string }[] | null;
};

/**
 * Lee el rol del usuario (RLS le deja ver solo el suyo).
 * null = la consulta falló; [] = no tiene rol asignado.
 */
export async function loadRolePermissions(
  supabase: SupabaseClient,
  userId: string
): Promise<Permission[] | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(is_system, role_permissions(permission))")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  if (!data) return [];

  const embedded = (data as { roles: RoleEmbed | RoleEmbed[] | null }).roles;
  const role = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!role) return [];

  return resolveEffectivePermissions({
    is_system: Boolean(role.is_system),
    permissions: (role.role_permissions ?? []).map((p) => p.permission),
  });
}
