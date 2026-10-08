import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  can,
  canAny,
  isPermission,
  permissionsByGroup,
  resolveEffectivePermissions,
} from "@/lib/auth/permissions";

describe("catálogo de permisos", () => {
  it("todos los permisos tienen etiqueta y grupo", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(PERMISSIONS[p].label.length).toBeGreaterThan(0);
      expect(PERMISSIONS[p].group.length).toBeGreaterThan(0);
    }
  });

  it("isPermission reconoce solo claves del catálogo", () => {
    expect(isPermission("sales.operate")).toBe(true);
    expect(isPermission("sales.unknown")).toBe(false);
    expect(isPermission("toString")).toBe(false);
    expect(isPermission(42)).toBe(false);
  });

  it("permissionsByGroup cubre todo el catálogo sin repetir", () => {
    const flat = permissionsByGroup().flatMap((g) => g.permissions);
    expect(flat).toHaveLength(ALL_PERMISSIONS.length);
    expect(new Set(flat)).toEqual(new Set(ALL_PERMISSIONS));
  });
});

describe("resolveEffectivePermissions", () => {
  it("sin rol no tiene permisos", () => {
    expect(resolveEffectivePermissions(null)).toEqual([]);
  });

  it("el rol de sistema tiene todos aunque no tenga filas", () => {
    expect(resolveEffectivePermissions({ is_system: true, permissions: [] })).toEqual(
      ALL_PERMISSIONS
    );
  });

  it("un rol normal tiene solo los suyos e ignora valores desconocidos", () => {
    expect(
      resolveEffectivePermissions({
        is_system: false,
        permissions: ["courts.operate", "legacy.permission", "tournaments.manage"],
      })
    ).toEqual(["courts.operate", "tournaments.manage"]);
  });
});

describe("can / canAny", () => {
  const perms = ["courts.operate", "tournaments.manage"] as const;

  it("can verifica un permiso", () => {
    expect(can(perms, "courts.operate")).toBe(true);
    expect(can(perms, "sales.operate")).toBe(false);
  });

  it("canAny alcanza con uno", () => {
    expect(canAny(perms, ["sales.operate", "tournaments.manage"])).toBe(true);
    expect(canAny(perms, ["sales.operate"])).toBe(false);
    expect(canAny(perms, [])).toBe(false);
  });
});
