export type RoleChangeInput = {
  actorId: string;
  targetId: string;
  /** El usuario al que se le cambia el rol es Admin (rol de sistema) hoy. */
  currentIsSystem: boolean;
  /** Cuántos usuarios tienen el rol Admin, incluido el target si lo es. */
  systemAdminCount: number;
  nextIsSystem: boolean;
  nextPermissions: readonly string[];
};

export type RoleChangeResult = { ok: true } | { ok: false; error: string };

/** Reglas para no quedarse sin quién administre usuarios. */
export function validateRoleChange(input: RoleChangeInput): RoleChangeResult {
  const nextCanManageUsers =
    input.nextIsSystem || input.nextPermissions.includes("users.manage");

  if (input.actorId === input.targetId && !nextCanManageUsers) {
    return {
      ok: false,
      error: "No podés quitarte el permiso de administrar usuarios.",
    };
  }

  if (input.currentIsSystem && !input.nextIsSystem && input.systemAdminCount <= 1) {
    return { ok: false, error: "Tiene que quedar al menos un usuario Admin." };
  }

  return { ok: true };
}
