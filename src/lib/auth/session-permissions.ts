import {
  FULL_ACCESS,
  isPermission,
  normalizeAccess,
  type EffectiveAccess,
  type Permission,
} from "./permissions";
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
 * app_permissions son escritura. app_read_permissions son solo lectura.
 * Un token viejo, sin la lista de lectura, trata app_permissions como escritura.
 */
export function permissionsFromClaims(
  claims: Record<string, unknown> | null | undefined
): EffectiveAccess | null {
  if (!claims || !Object.prototype.hasOwnProperty.call(claims, "app_role_id")) return null;
  if (claims.app_role_id == null) return { read: [], write: [] };
  if (claims.app_is_system === true) return { read: [], write: [...FULL_ACCESS.write] };

  const write: Permission[] = [];
  const read: Permission[] = [];
  const rawWrite = Array.isArray(claims.app_permissions) ? claims.app_permissions : [];
  const rawRead = Array.isArray(claims.app_read_permissions) ? claims.app_read_permissions : [];
  for (const value of rawWrite) {
    if (!isPermission(value)) continue;
    if (normalizeAccess(value, "write") === "write") write.push(value);
    else read.push(value);
  }
  for (const value of rawRead) {
    if (!isPermission(value) || write.includes(value)) continue;
    if (normalizeAccess(value, "read") === "write") write.push(value);
    else read.push(value);
  }
  return { read, write };
}

/**
 * Ruta a la que hay que redirigir, o null si puede quedarse.
 * Fuera de /admin no aplica, salvo /sin-acceso, de donde se sale si ya tiene permisos.
 */
export function redirectForPermissions(
  pathname: string,
  permissions: EffectiveAccess | readonly Permission[]
): string | null {
  if (pathname === NO_ACCESS_PATH) {
    return firstAllowedPage(permissions);
  }
  const requirement = resolvePageRequirement(pathname);
  if (!requirement || isAllowed(requirement, permissions)) return null;
  return firstAllowedPage(permissions) ?? NO_ACCESS_PATH;
}
