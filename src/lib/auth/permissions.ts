/**
 * Catálogo de permisos. Cada permiso corresponde a controles en código
 * (middleware de páginas/APIs y UI), por eso no se crean desde la app:
 * desde la app se arman roles combinando estos permisos.
 *
 * Cada permiso se asigna como lectura o escritura. La escritura incluye la lectura.
 * Ver una sección o un GET pide lectura. Crear, editar, borrar o cobrar pide escritura.
 */
export const PERMISSIONS = {
  "dashboard.view": { label: "Ver dashboard", group: "General", mode: "both" },
  "sales.operate": { label: "Cuentas abiertas y venta rápida", group: "Ventas", mode: "both" },
  "sales.cancel_discount": { label: "Cancelar cuentas y aplicar descuentos", group: "Ventas", mode: "both" },
  "sales.reports": { label: "Ver ventas, estadísticas y ranking de clientes", group: "Ventas", mode: "both" },
  "closures.daily": { label: "Cierre de caja diario", group: "Finanzas", mode: "both" },
  "closures.monthly": { label: "Cierre mensual", group: "Finanzas", mode: "both" },
  "balance.manage": { label: "Balance, retiros, ajustes y socios", group: "Finanzas", mode: "both" },
  "purchases.manage": { label: "Compras y proveedores", group: "Compras", mode: "both" },
  "products.manage": { label: "Productos, categorías y stock", group: "Compras", mode: "both" },
  "courts.operate": { label: "Turnos de canchas", group: "Canchas", mode: "both" },
  "courts.pricing": { label: "Precios y configuración de canchas", group: "Canchas", mode: "both" },
  "packs.define": { label: "Crear packs", group: "Packs", mode: "both" },
  "packs.sell": { label: "Vender packs", group: "Packs", mode: "both" },
  "packs.credits": { label: "Ver créditos", group: "Packs", mode: "both" },
  "classes.manage": { label: "Clases", group: "Clases", mode: "both" },
  "tournaments.manage": { label: "Torneos", group: "Torneos", mode: "both" },
  "players.manage": { label: "Pantalla de clientes (editar y borrar)", group: "Clientes", mode: "both" },
  "advertisements.manage": { label: "Publicidades", group: "Publicidades", mode: "both" },
  "users.manage": { label: "Usuarios y roles", group: "Administración", mode: "both" },
} as const satisfies Record<string, { label: string; group: string; mode: "read" | "write" | "both" }>;

export type Permission = keyof typeof PERMISSIONS;

export type AccessLevel = "read" | "write";

export type PermissionGrant = { permission: Permission; access: AccessLevel };

/** read = solo lectura. write = lectura y escritura. */
export type EffectiveAccess = {
  read: Permission[];
  write: Permission[];
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const EMPTY_ACCESS: EffectiveAccess = { read: [], write: [] };

export const FULL_ACCESS: EffectiveAccess = { read: [], write: [...ALL_PERMISSIONS] };

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** Permisos agrupados por sección, en el orden del catálogo (para la pantalla de roles). */
export function permissionsByGroup(): Array<{ group: string; permissions: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const p of ALL_PERMISSIONS) {
    const g = PERMISSIONS[p].group;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return Array.from(groups, ([group, permissions]) => ({ group, permissions }));
}

/**
 * Nivel que se guarda. Si no viene nivel, se asume escritura: así siguen los roles ya cargados.
 */
export function normalizeAccess(
  _permission: Permission,
  access: string | null | undefined
): AccessLevel {
  return access === "read" ? "read" : "write";
}

export function resolveEffectiveAccess(
  role: {
    is_system: boolean;
    grants: readonly { permission: string; access?: string | null }[];
  } | null
): EffectiveAccess {
  if (!role) return { read: [], write: [] };
  if (role.is_system) return { read: [], write: [...ALL_PERMISSIONS] };

  const read: Permission[] = [];
  const write: Permission[] = [];
  for (const grant of role.grants) {
    if (!isPermission(grant.permission)) continue;
    const access = normalizeAccess(grant.permission, grant.access);
    if (access === "write") write.push(grant.permission);
    else read.push(grant.permission);
  }
  return { read, write };
}

/**
 * Lista de permisos con escritura. La usan los tests y el rol de sistema.
 * Un array de permisos, sin nivel, significa escritura.
 */
export function resolveEffectivePermissions(
  role: { is_system: boolean; permissions: readonly string[] } | null
): Permission[] {
  if (!role) return [];
  if (role.is_system) return [...ALL_PERMISSIONS];
  return resolveEffectiveAccess({
    is_system: false,
    grants: role.permissions.map((permission) => ({ permission, access: "write" })),
  }).write;
}

function isEffectiveAccess(
  access: EffectiveAccess | readonly string[]
): access is EffectiveAccess {
  return !Array.isArray(access);
}

export function allows(
  access: EffectiveAccess | readonly string[] | null | undefined,
  permission: Permission,
  level: AccessLevel
): boolean {
  if (!access) return false;
  if (!isEffectiveAccess(access)) return access.includes(permission);
  if (access.write.includes(permission)) return true;
  return level === "read" && access.read.includes(permission);
}

export function can(
  access: EffectiveAccess | readonly Permission[],
  permission: Permission
): boolean {
  return allows(access, permission, "write");
}

export function canRead(
  access: EffectiveAccess | readonly Permission[],
  permission: Permission
): boolean {
  return allows(access, permission, "read");
}

export function canAny(permissions: readonly Permission[], required: readonly Permission[]): boolean {
  return required.some((p) => permissions.includes(p));
}
