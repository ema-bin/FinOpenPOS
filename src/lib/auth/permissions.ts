/**
 * Catálogo de permisos. Cada permiso corresponde a controles en código
 * (middleware de páginas/APIs y UI), por eso no se crean desde la app:
 * desde la app se arman roles combinando estos permisos.
 */
export const PERMISSIONS = {
  "dashboard.view": { label: "Ver dashboard", group: "General" },
  "sales.operate": { label: "Cuentas abiertas y venta rápida", group: "Ventas" },
  "sales.cancel_discount": { label: "Cancelar cuentas y aplicar descuentos", group: "Ventas" },
  "sales.reports": { label: "Ver ventas, estadísticas y ranking de clientes", group: "Ventas" },
  "closures.daily": { label: "Cierre de caja diario", group: "Finanzas" },
  "closures.monthly": { label: "Cierre mensual", group: "Finanzas" },
  "balance.manage": { label: "Balance, retiros, ajustes y socios", group: "Finanzas" },
  "purchases.manage": { label: "Compras y proveedores", group: "Compras" },
  "products.manage": { label: "Productos, categorías y stock", group: "Compras" },
  "courts.operate": { label: "Turnos de canchas", group: "Canchas" },
  "courts.pricing": { label: "Precios y configuración de canchas", group: "Canchas" },
  "tournaments.manage": { label: "Torneos", group: "Torneos" },
  "players.manage": { label: "Pantalla de clientes (editar y borrar)", group: "Clientes" },
  "advertisements.manage": { label: "Publicidades", group: "Publicidades" },
  "users.manage": { label: "Usuarios y roles", group: "Administración" },
} as const satisfies Record<string, { label: string; group: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

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
 * Permisos efectivos de un usuario a partir de su rol.
 * El rol de sistema (Admin) tiene siempre todos, incluidos permisos agregados después.
 * Valores desconocidos guardados en la DB se ignoran.
 */
export function resolveEffectivePermissions(
  role: { is_system: boolean; permissions: readonly string[] } | null
): Permission[] {
  if (!role) return [];
  if (role.is_system) return [...ALL_PERMISSIONS];
  return ALL_PERMISSIONS.filter((p) => role.permissions.includes(p));
}

export function can(permissions: readonly Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

export function canAny(permissions: readonly Permission[], required: readonly Permission[]): boolean {
  return required.some((p) => permissions.includes(p));
}
