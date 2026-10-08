import { describe, expect, it } from "vitest";
import {
  parseRoleWrite,
  validateRoleDelete,
  validateRoleUpdate,
  validateUserActiveChange,
} from "@/lib/auth/role-edit";

describe("parseRoleWrite", () => {
  it("creación exige nombre y acepta permisos", () => {
    expect(
      parseRoleWrite({ name: " Barra ", permissions: ["sales.operate", "sales.operate"] }, { partial: false })
    ).toEqual({ ok: true, value: { name: "Barra", permissions: ["sales.operate"] } });
  });

  it("rechaza un permiso que no existe", () => {
    expect(parseRoleWrite({ name: "X", permissions: ["no.existe"] }, { partial: false }).ok).toBe(false);
  });

  it("edición parcial acepta solo el nombre", () => {
    expect(parseRoleWrite({ name: "Caja" }, { partial: true })).toEqual({
      ok: true,
      value: { name: "Caja" },
    });
  });
});

describe("validateRoleUpdate", () => {
  it("no deja editar los permisos del rol Admin", () => {
    expect(
      validateRoleUpdate({
        isSystem: true,
        permissionsSent: true,
        actorRoleId: 1,
        roleId: 1,
        nextPermissions: ["sales.operate"],
      }).ok
    ).toBe(false);
  });

  it("deja renombrar el rol Admin", () => {
    expect(
      validateRoleUpdate({
        isSystem: true,
        permissionsSent: false,
        actorRoleId: 1,
        roleId: 1,
        nextPermissions: [],
      })
    ).toEqual({ ok: true });
  });

  it("deja renombrar tu propio rol sin tocar los permisos", () => {
    expect(
      validateRoleUpdate({
        isSystem: false,
        permissionsSent: false,
        actorRoleId: 4,
        roleId: 4,
        nextPermissions: [],
      })
    ).toEqual({ ok: true });
  });

  it("no te deja sacarte users.manage de tu propio rol", () => {
    expect(
      validateRoleUpdate({
        isSystem: false,
        permissionsSent: true,
        actorRoleId: 4,
        roleId: 4,
        nextPermissions: ["sales.operate"],
      }).ok
    ).toBe(false);
  });
});

describe("validateRoleDelete", () => {
  it("no borra el rol Admin ni un rol con usuarios", () => {
    expect(validateRoleDelete({ isSystem: true, assignedUsers: 0 }).ok).toBe(false);
    expect(validateRoleDelete({ isSystem: false, assignedUsers: 2 }).ok).toBe(false);
    expect(validateRoleDelete({ isSystem: false, assignedUsers: 0 })).toEqual({ ok: true });
  });
});

describe("validateUserActiveChange", () => {
  it("no te desactiva a vos ni al último Admin", () => {
    expect(
      validateUserActiveChange({
        actorId: "a",
        targetId: "a",
        active: false,
        targetIsSystem: true,
        systemAdminCount: 2,
      }).ok
    ).toBe(false);
    expect(
      validateUserActiveChange({
        actorId: "a",
        targetId: "b",
        active: false,
        targetIsSystem: true,
        systemAdminCount: 1,
      }).ok
    ).toBe(false);
  });

  it("deja desactivar a otro Admin si queda uno, y reactivar siempre", () => {
    expect(
      validateUserActiveChange({
        actorId: "a",
        targetId: "b",
        active: false,
        targetIsSystem: true,
        systemAdminCount: 2,
      })
    ).toEqual({ ok: true });
    expect(
      validateUserActiveChange({
        actorId: "a",
        targetId: "a",
        active: true,
        targetIsSystem: true,
        systemAdminCount: 1,
      })
    ).toEqual({ ok: true });
  });
});
