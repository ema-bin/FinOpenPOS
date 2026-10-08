import { canAny, type Permission } from "./permissions";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteRequirement =
  /** Sin sesión de usuario (la ruta se autentica sola, ej. cron con secreto). */
  | { kind: "public" }
  /** Cualquier usuario logueado. La ruta igual verifica la sesión. */
  | { kind: "authenticated" }
  /** Requiere tener al menos uno de los permisos. */
  | { kind: "anyOf"; permissions: readonly Permission[] };

const anyOf = (...permissions: Permission[]): RouteRequirement => ({ kind: "anyOf", permissions });
const PUBLIC: RouteRequirement = { kind: "public" };

/** Mismo requisito para todos los métodos que exporta la ruta. */
function all(req: RouteRequirement): Record<HttpMethod, RouteRequirement> {
  return { GET: req, POST: req, PUT: req, PATCH: req, DELETE: req };
}

// ---------------------------------------------------------------------------
// Páginas (/admin/...). Se aplica el prefijo más largo que matchee.
// ---------------------------------------------------------------------------

export const PAGE_RULES: ReadonlyArray<{ prefix: string; requirement: RouteRequirement }> = [
  { prefix: "/admin", requirement: anyOf("dashboard.view") },
  { prefix: "/admin/orders", requirement: anyOf("sales.operate") },
  { prefix: "/admin/quick-sale", requirement: anyOf("sales.operate") },
  { prefix: "/admin/daily-sales-closure", requirement: anyOf("closures.daily") },
  { prefix: "/admin/monthly-sales-closure", requirement: anyOf("closures.monthly") },
  { prefix: "/admin/balance", requirement: anyOf("balance.manage") },
  { prefix: "/admin/purchases", requirement: anyOf("purchases.manage") },
  { prefix: "/admin/purchases-history", requirement: anyOf("purchases.manage") },
  { prefix: "/admin/suppliers", requirement: anyOf("purchases.manage") },
  { prefix: "/admin/products", requirement: anyOf("products.manage") },
  { prefix: "/admin/court-slots", requirement: anyOf("courts.operate") },
  { prefix: "/admin/tournaments", requirement: anyOf("tournaments.manage") },
  { prefix: "/admin/players", requirement: anyOf("players.manage") },
  { prefix: "/admin/advertisements", requirement: anyOf("advertisements.manage") },
  { prefix: "/admin/users", requirement: anyOf("users.manage") },
  { prefix: "/admin/roles", requirement: anyOf("users.manage") },
];

/** Orden en que se elige la sección de destino cuando no hay acceso a la pedida. */
export const LANDING_PAGES: ReadonlyArray<{ path: string; permission: Permission }> = [
  { path: "/admin", permission: "dashboard.view" },
  { path: "/admin/court-slots", permission: "courts.operate" },
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
    return anyOf("users.manage");
  }
  return rule.requirement;
}

export function firstAllowedPage(permissions: readonly Permission[]): string | null {
  return LANDING_PAGES.find((p) => permissions.includes(p.permission))?.path ?? null;
}

// ---------------------------------------------------------------------------
// APIs (/api/...). Las claves usan la misma forma que las carpetas de src/app/api.
// ---------------------------------------------------------------------------

const PLAYERS_READ = anyOf("players.manage", "sales.operate", "tournaments.manage");
const PAYMENT_METHODS_READ = anyOf(
  "sales.operate",
  "balance.manage",
  "purchases.manage",
  "courts.operate",
  "tournaments.manage"
);
const COURTS_READ = anyOf("courts.operate", "courts.pricing", "tournaments.manage");
const PRODUCTS_READ = anyOf("sales.operate", "purchases.manage", "products.manage");
const CATEGORIES_READ = anyOf("sales.operate", "products.manage");
const ADS_READ = anyOf("advertisements.manage", "tournaments.manage");
const TOURNAMENTS = anyOf("tournaments.manage");
const SALES = anyOf("sales.operate");
const BALANCE = anyOf("balance.manage");

export const API_RULES: Readonly<Record<string, Partial<Record<HttpMethod, RouteRequirement>>>> = {
  "/api/cron/daily-sales-closure": { GET: PUBLIC },

  // Dashboard y reportes financieros
  "/api/admin/dashboard/sales": { GET: SALES },
  "/api/admin/dashboard/courts": { GET: anyOf("courts.operate") },
  "/api/admin/dashboard/tournaments": { GET: TOURNAMENTS },
  "/api/admin/cashflow": { GET: BALANCE },
  "/api/admin/expenses/category": { GET: BALANCE },
  "/api/admin/expenses/total": { GET: BALANCE },
  "/api/admin/profit/margin": { GET: BALANCE },
  "/api/admin/profit/total": { GET: BALANCE },
  "/api/admin/revenue/category": { GET: BALANCE },
  "/api/admin/revenue/total": { GET: BALANCE },

  // Ventas
  "/api/orders": { GET: SALES, POST: SALES },
  "/api/orders/[id]": { GET: SALES, PATCH: SALES },
  "/api/orders/[id]/cancel": { POST: anyOf("sales.cancel_discount") },
  "/api/orders/[id]/items": { POST: SALES },
  "/api/orders/[id]/items/[itemId]": { PATCH: SALES, DELETE: SALES },
  "/api/orders/[id]/pay": { POST: SALES },
  "/api/orders/quick-sale": { POST: SALES },
  "/api/orders/statistics": { GET: anyOf("sales.reports") },
  "/api/orders/client-ranking": { GET: anyOf("sales.reports") },
  "/api/transactions": { GET: anyOf("sales.reports", "balance.manage") },

  // Cierres y balance
  "/api/daily-sales-closures": all(anyOf("closures.daily")),
  "/api/daily-sales-closures/[date]": all(anyOf("closures.daily")),
  "/api/daily-sales-closures/preview": all(anyOf("closures.daily")),
  "/api/monthly-sales-closures": all(anyOf("closures.monthly")),
  "/api/monthly-sales-closures/[yearMonth]": all(anyOf("closures.monthly")),
  "/api/monthly-sales-closures/preview": all(anyOf("closures.monthly")),
  "/api/transactions/[id]": all(BALANCE),
  "/api/transactions/balance": all(BALANCE),
  "/api/transactions/adjustment": all(BALANCE),
  "/api/transactions/withdrawal": all(BALANCE),
  "/api/partners": all(BALANCE),
  "/api/payment-methods": { GET: PAYMENT_METHODS_READ, POST: BALANCE },
  "/api/payment-methods/[id]": { GET: PAYMENT_METHODS_READ, PATCH: BALANCE, DELETE: BALANCE },

  // Compras y productos
  "/api/purchases": all(anyOf("purchases.manage")),
  "/api/purchases/[id]": all(anyOf("purchases.manage")),
  "/api/purchases/[id]/items": all(anyOf("purchases.manage")),
  "/api/purchases/[id]/items/[itemId]": all(anyOf("purchases.manage")),
  "/api/purchases/quick-purchase": all(anyOf("purchases.manage")),
  "/api/suppliers": all(anyOf("purchases.manage")),
  "/api/suppliers/[id]": all(anyOf("purchases.manage")),
  "/api/products": { GET: PRODUCTS_READ, POST: anyOf("products.manage") },
  "/api/products/[id]": {
    GET: PRODUCTS_READ,
    PATCH: anyOf("products.manage"),
    DELETE: anyOf("products.manage"),
  },
  "/api/product-categories": { GET: CATEGORIES_READ, POST: anyOf("products.manage") },
  "/api/product-categories/[id]": {
    GET: CATEGORIES_READ,
    PATCH: anyOf("products.manage"),
    DELETE: anyOf("products.manage"),
  },
  "/api/stock-movements": all(anyOf("products.manage")),
  "/api/stock-movements/statistics": all(anyOf("products.manage")),

  // Canchas
  "/api/court-slots": all(anyOf("courts.operate")),
  "/api/court-slots/[id]": all(anyOf("courts.operate")),
  "/api/court-slots/generate": all(anyOf("courts.operate")),
  "/api/court-slots/pricing": { GET: anyOf("courts.operate", "courts.pricing") },
  "/api/court-slots/pricing/[courtId]": { PUT: anyOf("courts.pricing") },
  "/api/court-slot-day-notes": all(anyOf("courts.operate")),
  "/api/courts": { GET: COURTS_READ, POST: anyOf("courts.pricing") },
  "/api/courts/[id]": {
    GET: COURTS_READ,
    PATCH: anyOf("courts.pricing"),
    DELETE: anyOf("courts.pricing"),
  },

  // Clientes
  "/api/players": { GET: PLAYERS_READ, POST: PLAYERS_READ },
  "/api/players/duplicate-suggestions": { GET: PLAYERS_READ },
  "/api/players/[id]": {
    GET: PLAYERS_READ,
    PATCH: anyOf("players.manage"),
    DELETE: anyOf("players.manage"),
  },
  "/api/categories": { GET: anyOf("players.manage", "tournaments.manage") },

  // Publicidades
  "/api/advertisements": { GET: ADS_READ, POST: anyOf("advertisements.manage") },
  "/api/advertisements/[id]": {
    GET: ADS_READ,
    PATCH: anyOf("advertisements.manage"),
    DELETE: anyOf("advertisements.manage"),
  },
  "/api/advertisements/upload": { POST: anyOf("advertisements.manage") },

  // Mensajes de WhatsApp (invitaciones de torneo; recordatorios de deuda a futuro)
  "/api/whatsapp-message-templates": all(anyOf("tournaments.manage", "sales.operate")),
  "/api/whatsapp-message-templates/[id]": all(anyOf("tournaments.manage", "sales.operate")),

  // Torneos
  "/api/ranking": all(TOURNAMENTS),
  "/api/ranking/player-breakdown": all(TOURNAMENTS),
  "/api/ranking-point-rules": all(TOURNAMENTS),
  "/api/registration-pricing-settings": all(TOURNAMENTS),
  "/api/tournaments": all(TOURNAMENTS),
  "/api/tournaments/[id]": all(TOURNAMENTS),
  "/api/tournaments/[id]/clear-group-results": all(TOURNAMENTS),
  "/api/tournaments/[id]/close-groups": all(TOURNAMENTS),
  "/api/tournaments/[id]/close-groups/preview": all(TOURNAMENTS),
  "/api/tournaments/[id]/close-registration": all(TOURNAMENTS),
  "/api/tournaments/[id]/close-registration-stream": all(TOURNAMENTS),
  "/api/tournaments/[id]/close-schedule-review": all(TOURNAMENTS),
  "/api/tournaments/[id]/finish": all(TOURNAMENTS),
  "/api/tournaments/[id]/groups": all(TOURNAMENTS),
  "/api/tournaments/[id]/groups/[groupId]/first-round-pairing": all(TOURNAMENTS),
  "/api/tournaments/[id]/group-slots": all(TOURNAMENTS),
  "/api/tournaments/[id]/group-slots/append": all(TOURNAMENTS),
  "/api/tournaments/[id]/mark-playoffs-ready": all(TOURNAMENTS),
  "/api/tournaments/[id]/optimize-group-assignments": all(TOURNAMENTS),
  "/api/tournaments/[id]/payments": all(TOURNAMENTS),
  "/api/tournaments/[id]/playoff-preview": all(TOURNAMENTS),
  "/api/tournaments/[id]/playoffs": all(TOURNAMENTS),
  "/api/tournaments/[id]/promo-flyer": all(TOURNAMENTS),
  "/api/tournaments/[id]/promo-flyer/blob": all(TOURNAMENTS),
  "/api/tournaments/[id]/regenerate-schedule": all(TOURNAMENTS),
  "/api/tournaments/[id]/regenerate-schedule-stream": all(TOURNAMENTS),
  "/api/tournaments/[id]/registration-notifications": all(TOURNAMENTS),
  "/api/tournaments/[id]/registration-notifications/mark": all(TOURNAMENTS),
  "/api/tournaments/[id]/reopen-groups-phase": all(TOURNAMENTS),
  "/api/tournaments/[id]/reopen-schedule-review": all(TOURNAMENTS),
  "/api/tournaments/[id]/simulate-group-results": all(TOURNAMENTS),
  "/api/tournaments/[id]/simulate-playoff-results": all(TOURNAMENTS),
  "/api/tournaments/[id]/standings": all(TOURNAMENTS),
  "/api/tournaments/[id]/swap-groups": all(TOURNAMENTS),
  "/api/tournaments/[id]/swap-teams": all(TOURNAMENTS),
  "/api/tournaments/[id]/teams": all(TOURNAMENTS),
  "/api/tournaments/[id]/teams/[teamId]": all(TOURNAMENTS),
  "/api/tournaments/[id]/teams/[teamId]/restrictions": all(TOURNAMENTS),
  "/api/tournaments/[id]/teams/[teamId]/restrictions/initialize": all(TOURNAMENTS),
  "/api/tournaments/[id]/teams/initialize-restrictions": all(TOURNAMENTS),
  "/api/tournaments/playoffs-ready/close-groups": all(TOURNAMENTS),
  "/api/tournaments/playoffs-ready/group-slots": all(TOURNAMENTS),
  "/api/tournaments/playoffs-ready/preview": all(TOURNAMENTS),
  "/api/tournaments/playoffs-ready/schedule-preview": all(TOURNAMENTS),
  "/api/tournaments/playoffs-ready/summary": all(TOURNAMENTS),
  "/api/tournaments/schedule-review/group-slots": all(TOURNAMENTS),
  "/api/tournaments/schedule-review/groups-preview": all(TOURNAMENTS),
  "/api/tournaments/schedule-review/regenerate-stream": all(TOURNAMENTS),
  "/api/account/password": { POST: { kind: "authenticated" } },
  "/api/users": { GET: anyOf("users.manage"), POST: anyOf("users.manage") },
  "/api/users/[id]": { PATCH: anyOf("users.manage") },
  "/api/users/[id]/password": { POST: anyOf("users.manage") },
  "/api/users/[id]/status": { POST: anyOf("users.manage") },
  "/api/roles": { GET: anyOf("users.manage"), POST: anyOf("users.manage") },
  "/api/roles/[id]": { PATCH: anyOf("users.manage"), DELETE: anyOf("users.manage") },

  "/api/tournament-matches/[id]/photo/upload": all(TOURNAMENTS),
  "/api/tournament-matches/[id]/result": all(TOURNAMENTS),
  "/api/tournament-matches/[id]/schedule": all(TOURNAMENTS),
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
  permissions: readonly Permission[]
): ApiAccess {
  const requirement = resolveApiRequirement(pathname, method);
  if (requirement?.kind === "public") return "allow";
  if (!hasSession) return "unauthorized";
  if (!isAllowed(requirement, permissions)) return "forbidden";
  return "allow";
}

export function isAllowed(
  requirement: RouteRequirement | null,
  permissions: readonly Permission[]
): boolean {
  if (!requirement) return false;
  if (requirement.kind === "public" || requirement.kind === "authenticated") return true;
  return canAny(permissions, requirement.permissions);
}
