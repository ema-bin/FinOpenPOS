import { describe, expect, it } from "vitest";
import { validateRoleChange } from "@/lib/auth/assign-user-role";

const base = {
  actorId: "admin-1",
  targetId: "user-2",
  currentIsSystem: false,
  systemAdminCount: 1,
  nextIsSystem: false,
  nextPermissions: ["courts.operate"],
};

describe("validateRoleChange", () => {
  it("asigna un rol a otra persona", () => {
    expect(validateRoleChange(base)).toEqual({ ok: true });
  });

  it("no te deja quitarte el permiso de administrar usuarios", () => {
    const result = validateRoleChange({
      ...base,
      targetId: "admin-1",
      currentIsSystem: true,
      nextPermissions: ["sales.operate"],
    });
    expect(result.ok).toBe(false);
  });

  it("te deja cambiarte a otro rol que también administra usuarios", () => {
    expect(
      validateRoleChange({
        ...base,
        targetId: "admin-1",
        currentIsSystem: true,
        systemAdminCount: 2,
        nextPermissions: ["users.manage"],
      })
    ).toEqual({ ok: true });
  });

  it("no deja sacar al último Admin", () => {
    const result = validateRoleChange({
      ...base,
      currentIsSystem: true,
      systemAdminCount: 1,
      nextPermissions: ["users.manage"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/al menos un usuario Admin/);
  });

  it("deja bajar de Admin a otra persona si queda otro Admin", () => {
    expect(
      validateRoleChange({
        ...base,
        currentIsSystem: true,
        systemAdminCount: 2,
      })
    ).toEqual({ ok: true });
  });
});
