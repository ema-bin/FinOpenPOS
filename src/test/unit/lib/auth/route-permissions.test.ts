import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEffectivePermissions, type Permission } from "@/lib/auth/permissions";
import {
  API_RULES,
  firstAllowedPage,
  decideApiAccess,
  isAllowed,
  matchApiPattern,
  resolveApiRequirement,
  resolvePageRequirement,
} from "@/lib/auth/route-permissions";

const APP_DIR = path.resolve(__dirname, "../../../../app");

function findFiles(dir: string, fileName: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(full, fileName);
    return entry.name === fileName ? [full] : [];
  });
}

function toRoutePath(file: string): string {
  const rel = path.relative(APP_DIR, path.dirname(file)).split(path.sep).join("/");
  return `/${rel}`;
}

const sampleConcretePath = (pattern: string) => pattern.replace(/\[[^\]]+\]/g, "123");

const ADMIN_CANCHAS = resolveEffectivePermissions({
  is_system: false,
  permissions: ["dashboard.view", "courts.operate", "courts.pricing", "tournaments.manage"],
});
const CAJERO = resolveEffectivePermissions({
  is_system: false,
  permissions: [
    "dashboard.view",
    "courts.operate",
    "tournaments.manage",
    "sales.operate",
    "sales.cancel_discount",
    "sales.reports",
  ],
});
const ADMIN = resolveEffectivePermissions({ is_system: true, permissions: [] });

const canApi = (perms: Permission[], pathname: string, method: string) =>
  isAllowed(resolveApiRequirement(pathname, method), perms);
const canPage = (perms: Permission[], pathname: string) =>
  isAllowed(resolvePageRequirement(pathname), perms);

describe("cobertura del mapa de APIs", () => {
  const routeFiles = findFiles(path.join(APP_DIR, "api"), "route.ts");

  it("encuentra las rutas de la app", () => {
    expect(routeFiles.length).toBeGreaterThan(100);
  });

  it.each(routeFiles.map((f) => [toRoutePath(f), f]))(
    "%s tiene requisito para cada método exportado",
    (routePath, file) => {
      const source = fs.readFileSync(file, "utf8");
      const methods = Array.from(
        source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g),
        (m) => m[1]
      );
      expect(methods.length).toBeGreaterThan(0);

      const rule = API_RULES[routePath];
      expect(rule, `Falta ${routePath} en API_RULES`).toBeDefined();
      for (const method of methods) {
        expect(rule[method as keyof typeof rule], `Falta ${method} ${routePath}`).toBeDefined();
      }
      expect(matchApiPattern(sampleConcretePath(routePath))).toBe(routePath);
    }
  );

  it("no hay reglas para rutas que ya no existen", () => {
    const existing = new Set(routeFiles.map(toRoutePath));
    const stale = Object.keys(API_RULES).filter((p) => !existing.has(p));
    expect(stale).toEqual([]);
  });
});

describe("cobertura del mapa de páginas", () => {
  const pageFiles = findFiles(path.join(APP_DIR, "admin"), "page.tsx");

  it.each(pageFiles.map((f) => [toRoutePath(f)]))(
    "%s tiene una regla explícita (no cae en el default solo-Admin)",
    (routePath) => {
      const req = resolvePageRequirement(sampleConcretePath(routePath));
      expect(req).not.toBeNull();
      expect(isAllowed(req, ["users.manage"]) && !isAllowed(req, ["dashboard.view"])).toBe(
        routePath.startsWith("/admin/users") || routePath.startsWith("/admin/roles")
      );
    }
  );
});

describe("matchApiPattern", () => {
  it("una ruta estática gana a una dinámica", () => {
    expect(matchApiPattern("/api/orders/quick-sale")).toBe("/api/orders/quick-sale");
    expect(matchApiPattern("/api/orders/55")).toBe("/api/orders/[id]");
    expect(matchApiPattern("/api/tournaments/playoffs-ready/summary")).toBe(
      "/api/tournaments/playoffs-ready/summary"
    );
  });

  it("devuelve null para rutas desconocidas", () => {
    expect(matchApiPattern("/api/nope")).toBeNull();
    expect(resolveApiRequirement("/api/nope", "GET")).toBeNull();
  });

  it("método no mapeado se deniega", () => {
    expect(resolveApiRequirement("/api/orders/quick-sale", "GET")).toBeNull();
    expect(canApi(ADMIN, "/api/orders/quick-sale", "GET")).toBe(false);
  });

  it("cambiar la propia contraseña no exige un permiso de sección", () => {
    expect(resolveApiRequirement("/api/account/password", "POST")).toEqual({
      kind: "authenticated",
    });
    expect(canApi([], "/api/account/password", "POST")).toBe(true);
  });

  it("el cron es público (se autentica con su secreto)", () => {
    expect(resolveApiRequirement("/api/cron/daily-sales-closure", "GET")).toEqual({
      kind: "public",
    });
  });
});

describe("páginas por rol", () => {
  it("fuera de /admin no aplica", () => {
    expect(resolvePageRequirement("/login")).toBeNull();
    expect(resolvePageRequirement("/administrator")).toBeNull();
  });

  it("Admin entra a todo", () => {
    for (const p of ["/admin", "/admin/balance", "/admin/users", "/admin/whatever"]) {
      expect(canPage(ADMIN, p)).toBe(true);
    }
  });

  it("Admin Canchas: canchas y torneos", () => {
    expect(canPage(ADMIN_CANCHAS, "/admin")).toBe(true);
    expect(canPage(ADMIN_CANCHAS, "/admin/court-slots")).toBe(true);
    expect(canPage(ADMIN_CANCHAS, "/admin/tournaments/10")).toBe(true);
    expect(canPage(ADMIN_CANCHAS, "/admin/orders")).toBe(false);
    expect(canPage(ADMIN_CANCHAS, "/admin/players")).toBe(false);
    expect(canPage(ADMIN_CANCHAS, "/admin/balance")).toBe(false);
  });

  it("Cajero: canchas, torneos y ventas, sin finanzas ni compras", () => {
    expect(canPage(CAJERO, "/admin/orders/5")).toBe(true);
    expect(canPage(CAJERO, "/admin/quick-sale")).toBe(true);
    expect(canPage(CAJERO, "/admin/court-slots")).toBe(true);
    expect(canPage(CAJERO, "/admin/tournaments")).toBe(true);
    expect(canPage(CAJERO, "/admin/daily-sales-closure")).toBe(false);
    expect(canPage(CAJERO, "/admin/purchases")).toBe(false);
    expect(canPage(CAJERO, "/admin/users")).toBe(false);
  });

  it("páginas /admin no mapeadas quedan solo para Admin", () => {
    expect(canPage(CAJERO, "/admin/nueva-seccion")).toBe(false);
    expect(canPage(ADMIN, "/admin/nueva-seccion")).toBe(true);
  });

  it("firstAllowedPage elige la primera sección permitida", () => {
    expect(firstAllowedPage(CAJERO)).toBe("/admin");
    expect(firstAllowedPage(["tournaments.manage"])).toBe("/admin/tournaments");
    expect(firstAllowedPage([])).toBeNull();
  });
});

describe("decideApiAccess", () => {
  it("sin sesión: 401, salvo el cron", () => {
    expect(decideApiAccess("/api/orders", "GET", false, [])).toBe("unauthorized");
    expect(decideApiAccess("/api/cron/daily-sales-closure", "GET", false, [])).toBe("allow");
  });

  it("con sesión: el permiso de la ruta decide", () => {
    expect(decideApiAccess("/api/orders", "GET", true, CAJERO)).toBe("allow");
    expect(decideApiAccess("/api/orders", "GET", true, ADMIN_CANCHAS)).toBe("forbidden");
    expect(decideApiAccess("/api/orders/1/cancel", "POST", true, CAJERO)).toBe("allow");
    expect(decideApiAccess("/api/purchases", "GET", true, CAJERO)).toBe("forbidden");
  });

  it("una ruta o método que no está en el mapa se rechaza", () => {
    expect(decideApiAccess("/api/no-existe", "GET", true, ADMIN)).toBe("forbidden");
    expect(decideApiAccess("/api/orders/quick-sale", "GET", true, ADMIN)).toBe("forbidden");
  });

  it("cambiar la propia contraseña alcanza con estar logueado", () => {
    expect(decideApiAccess("/api/account/password", "POST", true, [])).toBe("allow");
    expect(decideApiAccess("/api/account/password", "POST", false, ADMIN)).toBe("unauthorized");
  });
});

describe("APIs por rol", () => {
  it("Admin Canchas puede cambiar precios de canchas; Cajero no", () => {
    expect(canApi(ADMIN_CANCHAS, "/api/court-slots/pricing/3", "PUT")).toBe(true);
    expect(canApi(CAJERO, "/api/court-slots/pricing/3", "PUT")).toBe(false);
    expect(canApi(CAJERO, "/api/court-slots/pricing", "GET")).toBe(true);
  });

  it("Cajero opera ventas, cancela y ve reportes; Admin Canchas no", () => {
    expect(canApi(CAJERO, "/api/orders/1/pay", "POST")).toBe(true);
    expect(canApi(CAJERO, "/api/orders/1/cancel", "POST")).toBe(true);
    expect(canApi(CAJERO, "/api/orders/statistics", "GET")).toBe(true);
    expect(canApi(ADMIN_CANCHAS, "/api/orders", "GET")).toBe(false);
  });

  it("jugadores: buscar y crear desde ventas/torneos, editar y borrar solo Admin", () => {
    expect(canApi(ADMIN_CANCHAS, "/api/players", "GET")).toBe(true);
    expect(canApi(CAJERO, "/api/players", "POST")).toBe(true);
    expect(canApi(CAJERO, "/api/players/9", "PATCH")).toBe(false);
    expect(canApi(ADMIN_CANCHAS, "/api/players/9", "DELETE")).toBe(false);
    expect(canApi(ADMIN, "/api/players/9", "DELETE")).toBe(true);
  });

  it("finanzas y compras quedan solo para Admin", () => {
    for (const perms of [ADMIN_CANCHAS, CAJERO]) {
      expect(canApi(perms, "/api/transactions/withdrawal", "POST")).toBe(false);
      expect(canApi(perms, "/api/daily-sales-closures", "POST")).toBe(false);
      expect(canApi(perms, "/api/purchases", "GET")).toBe(false);
      expect(canApi(perms, "/api/products", "POST")).toBe(false);
    }
  });

  it("endpoints compartidos de lectura habilitados para quien los necesita", () => {
    expect(canApi(ADMIN_CANCHAS, "/api/payment-methods", "GET")).toBe(true);
    expect(canApi(ADMIN_CANCHAS, "/api/courts", "GET")).toBe(true);
    expect(canApi(ADMIN_CANCHAS, "/api/advertisements", "GET")).toBe(true);
    expect(canApi(ADMIN_CANCHAS, "/api/advertisements", "POST")).toBe(false);
    expect(canApi(CAJERO, "/api/products", "GET")).toBe(true);
  });

  it("los endpoints que hoy no validan sesión pasan a exigir permiso", () => {
    expect(canApi([], "/api/registration-pricing-settings", "GET")).toBe(false);
    expect(canApi([], "/api/advertisements/upload", "POST")).toBe(false);
  });
});
