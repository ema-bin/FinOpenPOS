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

const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña legible para dictarla o copiarla. Omite caracteres ambiguos (0, O, 1, l). */
export function generateTemporaryPassword(length = 10, rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[Math.floor(rng() * TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}
