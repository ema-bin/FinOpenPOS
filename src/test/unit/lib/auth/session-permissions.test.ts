import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";
import {
  NO_ACCESS_PATH,
  decodeJwtPayload,
  permissionsFromClaims,
  redirectForPermissions,
} from "@/lib/auth/session-permissions";

function tokenWith(payload: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `aaa.${b64}.sig`;
}

const CAJERO = [
  "dashboard.view",
  "courts.operate",
  "tournaments.manage",
  "sales.operate",
  "sales.cancel_discount",
  "sales.reports",
] as const;

describe("decodeJwtPayload / permissionsFromClaims", () => {
  it("decodifica el payload", () => {
    expect(decodeJwtPayload(tokenWith({ email: "a@b.c", app_role_id: 1 }))).toMatchObject({
      email: "a@b.c",
      app_role_id: 1,
    });
  });

  it("token mal formado devuelve null", () => {
    expect(decodeJwtPayload("sin-puntos")).toBeNull();
    expect(decodeJwtPayload("a.@@@.c")).toBeNull();
  });

  it("sin app_role_id hay que ir a la DB", () => {
    expect(permissionsFromClaims({ email: "a@b.c" })).toBeNull();
    expect(permissionsFromClaims(null)).toBeNull();
  });

  it("rol de sistema tiene todos los permisos", () => {
    expect(
      permissionsFromClaims({ app_role_id: 1, app_is_system: true, app_permissions: [] })
    ).toEqual(ALL_PERMISSIONS);
  });

  it("sin rol asignado no tiene permisos", () => {
    expect(
      permissionsFromClaims({ app_role_id: null, app_is_system: false, app_permissions: [] })
    ).toEqual([]);
  });

  it("un rol normal usa su lista e ignora permisos desconocidos", () => {
    expect(
      permissionsFromClaims({
        app_role_id: 3,
        app_is_system: false,
        app_permissions: ["courts.operate", "no-existe"],
      })
    ).toEqual(["courts.operate"]);
  });
});

describe("redirectForPermissions", () => {
  it("el cajero entra a ventas y lo echan de compras hacia el dashboard", () => {
    expect(redirectForPermissions("/admin/orders", CAJERO)).toBeNull();
    expect(redirectForPermissions("/admin/purchases", CAJERO)).toBe("/admin");
  });

  it("sin ningún permiso va a la pantalla de sin acceso", () => {
    expect(redirectForPermissions("/admin", [])).toBe(NO_ACCESS_PATH);
    expect(redirectForPermissions("/admin/court-slots", [])).toBe(NO_ACCESS_PATH);
  });

  it("fuera de /admin no redirige", () => {
    expect(redirectForPermissions("/login", [])).toBeNull();
  });

  it("sale de sin acceso apenas tiene algún permiso", () => {
    expect(redirectForPermissions(NO_ACCESS_PATH, CAJERO)).toBe("/admin");
    expect(redirectForPermissions(NO_ACCESS_PATH, [])).toBeNull();
  });
});

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => result }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("loadRolePermissions", () => {
  it("rol de sistema", async () => {
    const perms = await loadRolePermissions(
      clientReturning({
        data: { roles: { is_system: true, role_permissions: [] } },
        error: null,
      }),
      "user-1"
    );
    expect(perms).toEqual(ALL_PERMISSIONS);
  });

  it("rol normal", async () => {
    const perms = await loadRolePermissions(
      clientReturning({
        data: {
          roles: {
            is_system: false,
            role_permissions: [{ permission: "courts.operate" }, { permission: "viejo" }],
          },
        },
        error: null,
      }),
      "user-1"
    );
    expect(perms).toEqual(["courts.operate"]);
  });

  it("sin fila no tiene rol", async () => {
    expect(
      await loadRolePermissions(clientReturning({ data: null, error: null }), "user-1")
    ).toEqual([]);
  });

  it("un error de consulta devuelve null para que el caller no bloquee", async () => {
    expect(
      await loadRolePermissions(
        clientReturning({ data: null, error: { message: "timeout" } }),
        "user-1"
      )
    ).toBeNull();
  });
});
