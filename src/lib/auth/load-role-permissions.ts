import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_ACCESS, resolveEffectiveAccess, type EffectiveAccess } from "./permissions";

type RoleEmbed = {
  is_system: boolean;
  role_permissions: { permission: string; access?: string | null }[] | null;
};

/**
 * Lee el rol del usuario (RLS le deja ver solo el suyo).
 * null = la consulta falló; acceso vacío = no tiene rol asignado.
 */
export async function loadRolePermissions(
  supabase: SupabaseClient,
  userId: string
): Promise<EffectiveAccess | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(is_system, role_permissions(permission, access))")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  if (!data) return EMPTY_ACCESS;

  const embedded = (data as { roles: RoleEmbed | RoleEmbed[] | null }).roles;
  const role = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!role) return EMPTY_ACCESS;

  return resolveEffectiveAccess({
    is_system: Boolean(role.is_system),
    grants: role.role_permissions ?? [],
  });
}
