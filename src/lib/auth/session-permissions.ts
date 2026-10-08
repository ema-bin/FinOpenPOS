import { ALL_PERMISSIONS, isPermission, type Permission } from "./permissions";
import { firstAllowedPage, isAllowed, resolvePageRequirement } from "./route-permissions";

/** A dónde va alguien logueado que no puede entrar a ninguna sección. */
export const NO_ACCESS_PATH = "/sin-acceso";

/** Decodifica el payload de un JWT sin verificar la firma. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const json = decodeURIComponent(
      Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
    );
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Permisos que el hook de Supabase dejó en el token.
 * null = el token no pasó por el hook (sesión anterior): hay que leerlos de la DB.
 */
export function permissionsFromClaims(
  claims: Record<string, unknown> | null | undefined
): Permission[] | null {
  if (!claims || !Object.prototype.hasOwnProperty.call(claims, "app_role_id")) return null;
  if (claims.app_role_id == null) return [];
  if (claims.app_is_system === true) return [...ALL_PERMISSIONS];
  const raw = Array.isArray(claims.app_permissions) ? claims.app_permissions : [];
  return raw.filter(isPermission);
}

/**
 * Ruta a la que hay que redirigir, o null si puede quedarse.
 * Fuera de /admin no aplica, salvo /sin-acceso, de donde se sale si ya tiene permisos.
 */
export function redirectForPermissions(
  pathname: string,
  permissions: readonly Permission[]
): string | null {
  if (pathname === NO_ACCESS_PATH) {
    return firstAllowedPage(permissions);
  }
  const requirement = resolvePageRequirement(pathname);
  if (!requirement || isAllowed(requirement, permissions)) return null;
  return firstAllowedPage(permissions) ?? NO_ACCESS_PATH;
}
