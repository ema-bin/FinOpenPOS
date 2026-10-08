import { isPermission, type Permission } from "@/lib/auth/permissions";

export const ROLE_NAME_MAX_LENGTH = 60;

export type RoleWrite = { name?: string; permissions?: Permission[] };

export type RoleEditResult = { ok: true } | { ok: false; error: string };

export function parseRoleWrite(
  raw: unknown,
  options: { partial: boolean }
): { ok: true; value: RoleWrite } | { ok: false; error: string } {
  const body = (raw ?? {}) as { name?: unknown; permissions?: unknown };
  const value: RoleWrite = {};

  if (body.name !== undefined || !options.partial) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { ok: false, error: "El nombre es requerido" };
    }
    const name = body.name.trim();
    if (name.length > ROLE_NAME_MAX_LENGTH) {
      return { ok: false, error: `El nombre no puede superar ${ROLE_NAME_MAX_LENGTH} caracteres` };
    }
    value.name = name;
  }

  if (body.permissions !== undefined || !options.partial) {
    const rawPermissions = body.permissions === undefined ? [] : body.permissions;
    if (!Array.isArray(rawPermissions)) {
      return { ok: false, error: "Los permisos son inválidos" };
    }
    if (rawPermissions.some((permission) => !isPermission(permission))) {
      return { ok: false, error: "Hay permisos que no existen" };
    }
    value.permissions = Array.from(new Set(rawPermissions.filter(isPermission)));
  }

  if (options.partial && value.name === undefined && value.permissions === undefined) {
    return { ok: false, error: "No hay cambios para guardar" };
  }

  return { ok: true, value };
}

/** El rol Admin no pierde permisos, y nadie se saca a sí mismo users.manage. */
export function validateRoleUpdate(input: {
  isSystem: boolean;
  permissionsSent: boolean;
  actorRoleId: number | null;
  roleId: number;
  nextPermissions: readonly string[];
}): RoleEditResult {
  if (input.isSystem && input.permissionsSent) {
    return {
      ok: false,
      error: "El rol Admin tiene siempre todos los permisos y no se pueden editar.",
    };
  }
  if (
    input.permissionsSent &&
    !input.isSystem &&
    input.actorRoleId === input.roleId &&
    !input.nextPermissions.includes("users.manage")
  ) {
    return { ok: false, error: "No podés quitarte el permiso de administrar usuarios." };
  }
  return { ok: true };
}

export function validateRoleDelete(input: {
  isSystem: boolean;
  assignedUsers: number;
}): RoleEditResult {
  if (input.isSystem) {
    return { ok: false, error: "El rol Admin no se puede eliminar." };
  }
  if (input.assignedUsers > 0) {
    return {
      ok: false,
      error: "Hay usuarios con este rol. Asignales otro antes de eliminarlo.",
    };
  }
  return { ok: true };
}

export function validateUserActiveChange(input: {
  actorId: string;
  targetId: string;
  active: boolean;
  targetIsSystem: boolean;
  systemAdminCount: number;
}): RoleEditResult {
  if (input.active) return { ok: true };
  if (input.actorId === input.targetId) {
    return { ok: false, error: "No podés desactivarte a vos mismo." };
  }
  if (input.targetIsSystem && input.systemAdminCount <= 1) {
    return { ok: false, error: "Tiene que quedar al menos un usuario Admin." };
  }
  return { ok: true };
}
