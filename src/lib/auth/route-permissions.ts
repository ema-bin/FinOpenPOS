import { allows, type AccessLevel, type EffectiveAccess, type Permission } from "./permissions";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteRequirement =
  /** Sin sesión de usuario (la ruta se autentica sola, ej. cron con secreto). */
  | { kind: "public" }
  /** Cualquier usuario logueado. La ruta igual verifica la sesión. */
  | { kind: "authenticated" }
  /** Requiere tener al menos uno de los permisos en ese nivel. Escritura incluye lectura. */
  | { kind: "anyOf"; access: AccessLevel; permissions: readonly Permission[] };

const read = (...permissions: Permission[]): RouteRequirement => ({
  kind: "anyOf",
  access: "read",
  permissions,
});
const write = (...permissions: Permission[]): RouteRequirement => ({
  kind: "anyOf",
  access: "write",
  permissions,
});

/** GET pide lectura. El resto de los métodos pide escritura. */
function crud(...permissions: Permission[]): Record<HttpMethod, RouteRequirement> {
  return {
    GET: read(...permissions),
    POST: write(...permissions),
    PUT: write(...permissions),
    PATCH: write(...permissions),
    DELETE: write(...permissions),
  };
}

// ---------------------------------------------------------------------------
// Páginas (/admin/...). Se aplica el prefijo más largo que matchee.
// ---------------------------------------------------------------------------

export const PAGE_RULES: ReadonlyArray<{ prefix: string; requirement: RouteRequirement }> = [
  { prefix: "/admin", requirement: read("dashboard.view") },
  { prefix: "/admin/orders", requirement: read("sales.operate") },
  { prefix: "/admin/quick-sale", requirement: read("sales.operate") },
  { prefix: "/admin/daily-sales-closure", requirement: read("closures.daily") },
  { prefix: "/admin/monthly-sales-closure", requirement: read("closures.monthly") },
  { prefix: "/admin/balance", requirement: read("balance.manage") },
  { prefix: "/admin/purchases", requirement: read("purchases.manage") },
  { prefix: "/admin/purchases-history", requirement: read("purchases.manage") },
  { prefix: "/admin/suppliers", requirement: read("purchases.manage") },
  { prefix: "/admin/products", requirement: read("products.manage") },
  { prefix: "/admin/court-slots", requirement: read("courts.operate") },
  { prefix: "/admin/classes", requirement: read("classes.manage") },
  { prefix: "/admin/tournaments", requirement: read("tournaments.manage") },
  { prefix: "/admin/players", requirement: read("players.manage") },
  { prefix: "/admin/advertisements", requirement: read("advertisements.manage") },
  { prefix: "/admin/users", requirement: read("users.manage") },
  { prefix: "/admin/roles", requirement: read("users.manage") },
];

/** Orden en que se elige la sección de destino cuando no hay acceso a la pedida. */
export const LANDING_PAGES: ReadonlyArray<{ path: string; permission: Permission }> = [
  { path: "/admin", permission: "dashboard.view" },
  { path: "/admin/court-slots", permission: "courts.operate" },
  { path: "/admin/classes", permission: "classes.manage" },
  { path: "/admin/orders", permission: "sales.operate" },
  { path: "/admin/tournaments", permission: "tournaments.manage" },
  { path: "/admin/players", permission: "players.manage" },
  { path: "/admin/purchases", permission: "purchases.manage" },
  { path: "/admin/products", permission: "products.manage" },
  { path: "/admin/balance", permission: "balance.manage" },
  { path: "/admin/daily-sales-closure", permission: "closures.daily" },
  { path: "/admin/monthly-sales-closure", permission: "closures.monthly" },
  { path: "/admin/advertisements", permission: "advertisements.manage" },
  { path: "/admin/users", permission: "users.manage" },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** null = página fuera de /admin (login, auth, etc.). Páginas /admin no mapeadas: solo Admin. */
export function resolvePageRequirement(pathname: string): RouteRequirement | null {
  if (!matchesPrefix(pathname, "/admin")) return null;
  const rule = PAGE_RULES.filter((r) => matchesPrefix(pathname, r.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length
  )[0];
  if (!rule || (rule.prefix === "/admin" && pathname !== "/admin")) {
    return write("users.manage");
  }
  return rule.requirement;
}

export function firstAllowedPage(
  access: EffectiveAccess | readonly Permission[]
): string | null {
  return LANDING_PAGES.find((p) => allows(access, p.permission, "read"))?.path ?? null;
}

// ---------------------------------------------------------------------------
// APIs (/api/...). Las claves usan la misma forma que las carpetas de src/app/api.
// ---------------------------------------------------------------------------

const PLAYER_SOURCES = [
  "players.manage",
  "sales.operate",
  "tournaments.manage",
  "classes.manage",
] as const;
const PAYMENT_SOURCES = [
  "sales.operate",
  "balance.manage",
  "purchases.manage",
  "courts.operate",
  "tournaments.manage",
] as const;
const COURT_SOURCES = [
  "courts.operate",
  "courts.pricing",
  "tournaments.manage",
  "classes.manage",
] as const;
const PRODUCT_SOURCES = ["sales.operate", "purchases.manage", "products.manage"] as const;
const CATEGORY_SOURCES = ["sales.operate", "products.manage"] as const;
const AD_SOURCES = ["advertisements.manage", "tournaments.manage"] as const;
const PUBLIC: RouteRequirement = { kind: "public" };

export const API_RULES: Readonly<Record<string, Partial<Record<HttpMethod, RouteRequirement>>>> = {
  "/api/cron/daily-sales-closure": { GET: PUBLIC },

  // Dashboard y reportes financieros
  "/api/admin/dashboard/sales": { GET: read("sales.operate") },
  "/api/admin/dashboard/courts": { GET: read("courts.operate") },
  "/api/admin/dashboard/tournaments": { GET: read("tournaments.manage") },
  "/api/admin/cashflow": { GET: read("balance.manage") },
  "/api/admin/expenses/category": { GET: read("balance.manage") },
  "/api/admin/expenses/total": { GET: read("balance.manage") },
  "/api/admin/profit/margin": { GET: read("balance.manage") },
  "/api/admin/profit/total": { GET: read("balance.manage") },
  "/api/admin/revenue/category": { GET: read("balance.manage") },
  "/api/admin/revenue/total": { GET: read("balance.manage") },

  // Ventas
  "/api/orders": { GET: read("sales.operate"), POST: write("sales.operate") },
  "/api/orders/[id]": { GET: read("sales.operate"), PATCH: write("sales.operate") },
  "/api/orders/[id]/cancel": { POST: write("sales.cancel_discount") },
  "/api/orders/[id]/items": { POST: write("sales.operate") },
  "/api/orders/[id]/items/[itemId]": { PATCH: write("sales.operate"), DELETE: write("sales.operate") },
  "/api/orders/[id]/pay": { POST: write("sales.operate") },
  "/api/orders/quick-sale": { POST: write("sales.operate") },
  "/api/orders/statistics": { GET: read("sales.reports") },
  "/api/orders/client-ranking": { GET: read("sales.reports") },
  "/api/transactions": { GET: read("sales.reports", "balance.manage") },

  // Cierres y balance
  "/api/daily-sales-closures": crud("closures.daily"),
  "/api/daily-sales-closures/[date]": crud("closures.daily"),
  "/api/daily-sales-closures/preview": crud("closures.daily"),
  "/api/monthly-sales-closures": crud("closures.monthly"),
  "/api/monthly-sales-closures/[yearMonth]": crud("closures.monthly"),
  "/api/monthly-sales-closures/preview": crud("closures.monthly"),
  "/api/transactions/[id]": crud("balance.manage"),
  "/api/transactions/balance": crud("balance.manage"),
  "/api/transactions/adjustment": crud("balance.manage"),
  "/api/transactions/withdrawal": crud("balance.manage"),
  "/api/partners": crud("balance.manage"),
  "/api/payment-methods": { GET: read(...PAYMENT_SOURCES), POST: write("balance.manage") },
  "/api/payment-methods/[id]": {
    GET: read(...PAYMENT_SOURCES),
    PATCH: write("balance.manage"),
    DELETE: write("balance.manage"),
  },

  // Compras y productos
  "/api/purchases": crud("purchases.manage"),
  "/api/purchases/[id]": crud("purchases.manage"),
  "/api/purchases/[id]/items": crud("purchases.manage"),
  "/api/purchases/[id]/items/[itemId]": crud("purchases.manage"),
  "/api/purchases/quick-purchase": crud("purchases.manage"),
  "/api/suppliers": crud("purchases.manage"),
  "/api/suppliers/[id]": crud("purchases.manage"),
  "/api/products": { GET: read(...PRODUCT_SOURCES), POST: write("products.manage") },
  "/api/products/[id]": {
    GET: read(...PRODUCT_SOURCES),
    PATCH: write("products.manage"),
    DELETE: write("products.manage"),
  },
  "/api/product-categories": { GET: read(...CATEGORY_SOURCES), POST: write("products.manage") },
  "/api/product-categories/[id]": {
    GET: read(...CATEGORY_SOURCES),
    PATCH: write("products.manage"),
    DELETE: write("products.manage"),
  },
  "/api/stock-movements": crud("products.manage"),
  "/api/stock-movements/statistics": crud("products.manage"),

  // Clases
  "/api/classes/professors": crud("classes.manage"),
  "/api/classes/professors/[id]": crud("classes.manage"),
  "/api/classes/professors/[id]/rates": crud("classes.manage"),
  "/api/classes/rates/[id]": crud("classes.manage"),
  "/api/classes/schedules": crud("classes.manage"),
  "/api/classes/schedules/[id]": crud("classes.manage"),
  "/api/classes/schedules/[id]/enrollments": crud("classes.manage"),
  "/api/classes/enrollments/[id]": crud("classes.manage"),
  "/api/classes/sessions": crud("classes.manage"),
  "/api/classes/sessions/[id]": crud("classes.manage"),
  "/api/classes/sessions/[id]/players": crud("classes.manage"),
  "/api/classes/charges": crud("classes.manage"),
  "/api/classes/charges/[id]": crud("classes.manage"),
  "/api/classes/charges/[id]/pay": crud("classes.manage"),
  "/api/classes/charges/close": crud("classes.manage"),

  // Canchas
  "/api/court-slots": crud("courts.operate"),
  "/api/court-slots/[id]": crud("courts.operate"),
  "/api/court-slots/generate": crud("courts.operate"),
  "/api/court-slots/pricing": { GET: read("courts.operate", "courts.pricing") },
  "/api/court-slots/pricing/[courtId]": { PUT: write("courts.pricing") },
  "/api/court-slot-day-notes": crud("courts.operate"),
  "/api/courts": { GET: read(...COURT_SOURCES), POST: write("courts.pricing") },
  "/api/courts/[id]": {
    GET: read(...COURT_SOURCES),
    PATCH: write("courts.pricing"),
    DELETE: write("courts.pricing"),
  },

  // Clientes. Buscar es lectura de la sección que lo necesita. Crear pide escritura
  // de esa sección. Editar y borrar queda en clientes.
  "/api/players": { GET: read(...PLAYER_SOURCES), POST: write(...PLAYER_SOURCES) },
  "/api/players/duplicate-suggestions": { GET: read(...PLAYER_SOURCES) },
  "/api/players/[id]": {
    GET: read(...PLAYER_SOURCES),
    PATCH: write("players.manage"),
    DELETE: write("players.manage"),
  },
  "/api/categories": { GET: read("players.manage", "tournaments.manage") },

  // Publicidades
  "/api/advertisements": { GET: read(...AD_SOURCES), POST: write("advertisements.manage") },
  "/api/advertisements/[id]": {
    GET: read(...AD_SOURCES),
    PATCH: write("advertisements.manage"),
    DELETE: write("advertisements.manage"),
  },
  "/api/advertisements/upload": { POST: write("advertisements.manage") },

  // Mensajes de WhatsApp (invitaciones de torneo; recordatorios de deuda a futuro)
  "/api/whatsapp-message-templates": crud("tournaments.manage", "sales.operate"),
  "/api/whatsapp-message-templates/[id]": crud("tournaments.manage", "sales.operate"),

  // Torneos
  "/api/ranking": crud("tournaments.manage"),
  "/api/ranking/player-breakdown": crud("tournaments.manage"),
  "/api/ranking-point-rules": crud("tournaments.manage"),
  "/api/registration-pricing-settings": crud("tournaments.manage"),
  "/api/tournaments": crud("tournaments.manage"),
  "/api/tournaments/[id]": crud("tournaments.manage"),
  "/api/tournaments/[id]/clear-group-results": crud("tournaments.manage"),
  "/api/tournaments/[id]/close-groups": crud("tournaments.manage"),
  "/api/tournaments/[id]/close-groups/preview": crud("tournaments.manage"),
  "/api/tournaments/[id]/close-registration": crud("tournaments.manage"),
  "/api/tournaments/[id]/close-registration-stream": crud("tournaments.manage"),
  "/api/tournaments/[id]/close-schedule-review": crud("tournaments.manage"),
  "/api/tournaments/[id]/finish": crud("tournaments.manage"),
  "/api/tournaments/[id]/groups": crud("tournaments.manage"),
  "/api/tournaments/[id]/groups/[groupId]/first-round-pairing": crud("tournaments.manage"),
  "/api/tournaments/[id]/group-slots": crud("tournaments.manage"),
  "/api/tournaments/[id]/group-slots/append": crud("tournaments.manage"),
  "/api/tournaments/[id]/mark-playoffs-ready": crud("tournaments.manage"),
  "/api/tournaments/[id]/optimize-group-assignments": crud("tournaments.manage"),
  "/api/tournaments/[id]/payments": crud("tournaments.manage"),
  "/api/tournaments/[id]/playoff-preview": crud("tournaments.manage"),
  "/api/tournaments/[id]/playoffs": crud("tournaments.manage"),
  "/api/tournaments/[id]/promo-flyer": crud("tournaments.manage"),
  "/api/tournaments/[id]/promo-flyer/blob": crud("tournaments.manage"),
  "/api/tournaments/[id]/regenerate-schedule": crud("tournaments.manage"),
  "/api/tournaments/[id]/regenerate-schedule-stream": crud("tournaments.manage"),
  "/api/tournaments/[id]/registration-notifications": crud("tournaments.manage"),
  "/api/tournaments/[id]/registration-notifications/mark": crud("tournaments.manage"),
  "/api/tournaments/[id]/reopen-groups-phase": crud("tournaments.manage"),
  "/api/tournaments/[id]/reopen-schedule-review": crud("tournaments.manage"),
  "/api/tournaments/[id]/simulate-group-results": crud("tournaments.manage"),
  "/api/tournaments/[id]/simulate-playoff-results": crud("tournaments.manage"),
  "/api/tournaments/[id]/standings": crud("tournaments.manage"),
  "/api/tournaments/[id]/swap-groups": crud("tournaments.manage"),
  "/api/tournaments/[id]/swap-teams": crud("tournaments.manage"),
  "/api/tournaments/[id]/teams": crud("tournaments.manage"),
  "/api/tournaments/[id]/teams/[teamId]": crud("tournaments.manage"),
  "/api/tournaments/[id]/teams/[teamId]/restrictions": crud("tournaments.manage"),
  "/api/tournaments/[id]/teams/[teamId]/restrictions/initialize": crud("tournaments.manage"),
  "/api/tournaments/[id]/teams/initialize-restrictions": crud("tournaments.manage"),
  "/api/tournaments/playoffs-ready/close-groups": crud("tournaments.manage"),
  "/api/tournaments/playoffs-ready/group-slots": crud("tournaments.manage"),
  "/api/tournaments/playoffs-ready/preview": crud("tournaments.manage"),
  "/api/tournaments/playoffs-ready/schedule-preview": crud("tournaments.manage"),
  "/api/tournaments/playoffs-ready/summary": crud("tournaments.manage"),
  "/api/tournaments/schedule-review/group-slots": crud("tournaments.manage"),
  "/api/tournaments/schedule-review/groups-preview": crud("tournaments.manage"),
  "/api/tournaments/schedule-review/regenerate-stream": crud("tournaments.manage"),
  "/api/account/password": { POST: { kind: "authenticated" } },
  "/api/users": { GET: read("users.manage"), POST: write("users.manage") },
  "/api/users/[id]": { PATCH: write("users.manage") },
  "/api/users/[id]/password": { POST: write("users.manage") },
  "/api/users/[id]/status": { POST: write("users.manage") },
  "/api/roles": { GET: read("users.manage"), POST: write("users.manage") },
  "/api/roles/[id]": { PATCH: write("users.manage"), DELETE: write("users.manage") },

  "/api/tournament-matches/[id]/photo/upload": crud("tournaments.manage"),
  "/api/tournament-matches/[id]/result": crud("tournaments.manage"),
  "/api/tournament-matches/[id]/schedule": crud("tournaments.manage"),
};

const splitPath = (path: string) => path.split("/").filter(Boolean);
const isDynamic = (segment: string) => segment.startsWith("[") && segment.endsWith("]");

/** Patrón de API_RULES que corresponde a un pathname concreto (estático gana a [param], como en Next). */
export function matchApiPattern(pathname: string): string | null {
  const parts = splitPath(pathname);
  const candidates = Object.keys(API_RULES).filter((pattern) => {
    const segs = splitPath(pattern);
    return (
      segs.length === parts.length &&
      segs.every((s, i) => isDynamic(s) || s === parts[i])
    );
  });
  candidates.sort((a, b) => {
    const sa = splitPath(a);
    const sb = splitPath(b);
    for (let i = 0; i < sa.length; i++) {
      const da = isDynamic(sa[i]);
      const db = isDynamic(sb[i]);
      if (da !== db) return da ? 1 : -1;
    }
    return 0;
  });
  return candidates[0] ?? null;
}

/** null = ruta o método no mapeado (se deniega). */
export function resolveApiRequirement(pathname: string, method: string): RouteRequirement | null {
  const pattern = matchApiPattern(pathname);
  if (!pattern) return null;
  return API_RULES[pattern][method.toUpperCase() as HttpMethod] ?? null;
}

export type ApiAccess = "allow" | "unauthorized" | "forbidden";

/** Decisión de acceso a una API. `public` pasa sin sesión; el resto exige sesión y el permiso del mapa. */
export function decideApiAccess(
  pathname: string,
  method: string,
  hasSession: boolean,
  permissions: EffectiveAccess | readonly Permission[]
): ApiAccess {
  const requirement = resolveApiRequirement(pathname, method);
  if (requirement?.kind === "public") return "allow";
  if (!hasSession) return "unauthorized";
  if (!isAllowed(requirement, permissions)) return "forbidden";
  return "allow";
}

export function isAllowed(
  requirement: RouteRequirement | null,
  permissions: EffectiveAccess | readonly Permission[]
): boolean {
  if (!requirement) return false;
  if (requirement.kind === "public" || requirement.kind === "authenticated") return true;
  return requirement.permissions.some((permission) =>
    allows(permissions, permission, requirement.access)
  );
}
