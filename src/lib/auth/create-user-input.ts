const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 6;

export type NewUserInput = {
  email: string;
  password: string;
  name: string;
  roleId: number;
};

export type ParseUserResult = { ok: true; value: NewUserInput } | { ok: false; error: string };

export function parseCreateUserInput(raw: unknown): ParseUserResult {
  const body = (raw ?? {}) as {
    email?: unknown;
    password?: unknown;
    name?: unknown;
    roleId?: unknown;
  };

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) {
    return { ok: false, error: "El email no es válido" };
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }

  const roleId = Number(body.roleId);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    return { ok: false, error: "Elegí un rol" };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  return { ok: true, value: { email, password, name, roleId } };
}

export function parseTemporaryPassword(
  raw: unknown
): { ok: true; password: string } | { ok: false; error: string } {
  const password = typeof raw === "string" ? raw : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }
  return { ok: true, password };
}

export type OwnPasswordChange = { currentPassword: string; newPassword: string };

/** Cambio de la propia contraseña: hay que saber la actual y la nueva tiene que ser distinta. */
export function parseOwnPasswordChange(
  raw: unknown
): { ok: true; value: OwnPasswordChange } | { ok: false; error: string } {
  const body = (raw ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return { ok: false, error: "Ingresá tu contraseña actual" };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: "La nueva contraseña tiene que ser distinta a la actual" };
  }
  return { ok: true, value: { currentPassword, newPassword } };
}

const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña legible para dictarla o copiarla. Omite caracteres ambiguos (0, O, 1, l). */
export function generateTemporaryPassword(length = 10, rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[Math.floor(rng() * TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}
