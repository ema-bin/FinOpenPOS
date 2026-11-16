import { parseCreateUserInput } from "@/lib/auth/create-user-input";
import { parseClubSettings, type ClubSettings } from "@/lib/clubs/settings";

export type ClubAltaInput = {
  settings: Omit<ClubSettings, "id">;
  courts: string[];
  payments: {
    courts: string[];
    buffet: string[];
    classes: string[];
    tournaments: string[];
  };
  admin: { email: string; password: string; name: string };
};

export type ParseAltaResult = { ok: true; value: ClubAltaInput } | { ok: false; error: string };

function names(value: unknown, label: string, required: boolean): string[] | { error: string } {
  if (!Array.isArray(value)) return { error: `${label} tiene que ser una lista` };
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    const name = String(item ?? "").trim();
    if (!name) continue;
    if (name.length > 50) return { error: `${label}: "${name}" supera los 50 caracteres` };
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return { error: `${label}: "${name}" está repetido` };
    seen.add(key);
    list.push(name);
  }
  if (required && list.length === 0) return { error: `Agregá al menos un nombre en ${label}` };
  if (list.length > 30) return { error: `${label} acepta hasta 30 nombres` };
  return list;
}

function failed(value: string[] | { error: string }): value is { error: string } {
  return !Array.isArray(value);
}

export function parseClubAlta(raw: unknown): ParseAltaResult {
  const body = (raw ?? {}) as {
    settings?: unknown;
    courts?: unknown;
    payments?: unknown;
    admin?: unknown;
  };
  const settings = parseClubSettings(body.settings);
  if (!settings.ok) return settings;

  const courts = names(body.courts, "Canchas", true);
  if (failed(courts)) return { ok: false, error: courts.error };

  const payments = (body.payments ?? {}) as Record<string, unknown>;
  const courtPayments = names(payments.courts, "Medios de canchas", false);
  const buffetPayments = names(payments.buffet, "Medios de cantina", false);
  const classPayments = names(payments.classes, "Medios de clases", false);
  const tournamentPayments = names(payments.tournaments, "Medios de torneos", false);
  const lists = [courtPayments, buffetPayments, classPayments, tournamentPayments];
  const invalid = lists.find(failed);
  if (invalid) return { ok: false, error: invalid.error };

  const admin = (body.admin ?? {}) as { email?: unknown; password?: unknown; name?: unknown };
  const user = parseCreateUserInput({ ...admin, roleId: 1 });
  if (!user.ok) return user;
  if (!user.value.name) return { ok: false, error: "El admin necesita un nombre" };

  return {
    ok: true,
    value: {
      settings: { ...settings.value, logo_url: null },
      courts,
      payments: {
        courts: courtPayments as string[],
        buffet: buffetPayments as string[],
        classes: classPayments as string[],
        tournaments: tournamentPayments as string[],
      },
      admin: { email: user.value.email, password: user.value.password, name: user.value.name },
    },
  };
}
