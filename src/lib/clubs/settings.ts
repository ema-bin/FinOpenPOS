import { isHslTriplet } from "@/lib/clubs/color";

export type ClubSettings = {
  id: number;
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  on_primary_color: string;
  timezone: string;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
  overnight_slot: boolean;
  fixed_weekdays: number[];
  class_player_limit: number;
  registration_discount_percent: number;
  module_reservations: boolean;
  module_classes: boolean;
  module_tournaments: boolean;
  module_packs: boolean;
  module_buffet: boolean;
  auto_daily_closure: boolean;
  daily_closure_hour: number;
  auto_reservation_week: boolean;
  reservation_week_weekday: number;
  reservation_week_hour: number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(value: unknown, label: string, max: number): string | { error: string } {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (!cleaned) return { error: `Completá ${label}` };
  if (cleaned.length > max) return { error: `${label} es demasiado largo` };
  return cleaned;
}

function clock(value: unknown, label: string): string | { error: string } {
  const cleaned = typeof value === "string" ? value.trim().slice(0, 5) : "";
  if (!TIME_PATTERN.test(cleaned)) return { error: `${label} no es un horario válido` };
  return cleaned;
}

function hsl(value: unknown, label: string): string | { error: string } {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (!isHslTriplet(cleaned)) return { error: `${label} no es un color válido` };
  return cleaned;
}

function intIn(value: unknown, label: string, min: number, max: number): number | { error: string } {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { error: `${label} tiene que estar entre ${min} y ${max}` };
  }
  return n;
}

function flag(value: unknown): boolean | { error: string } {
  if (typeof value !== "boolean") return { error: "Hay un interruptor inválido" };
  return value;
}

function failed(value: unknown): value is { error: string } {
  return typeof value === "object" && value != null && "error" in value;
}

export function parseClubSettings(body: unknown): { ok: true; value: Omit<ClubSettings, "id"> } | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const name = text(raw.name, "el nombre", 80);
  const shortName = text(raw.short_name, "el nombre corto", 20);
  const logo = raw.logo_url == null || raw.logo_url === "" ? null : String(raw.logo_url).trim();
  if (logo && !/^https?:\/\//i.test(logo)) return { ok: false, error: "El logo tiene que ser una URL" };
  const primary = hsl(raw.primary_color, "El color principal");
  const accent = hsl(raw.accent_color, "El color de acento");
  const onPrimary = hsl(raw.on_primary_color, "El color de texto");
  const timezone = text(raw.timezone, "la zona horaria", 80);
  const openTime = clock(raw.open_time, "La apertura");
  const closeTime = clock(raw.close_time, "El cierre");
  const duration = intIn(raw.slot_duration_minutes, "La duración del turno", 15, 240);
  const classLimit = intIn(raw.class_player_limit, "El cupo de la clase", 1, 30);
  const discount = Number(raw.registration_discount_percent);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    return { ok: false, error: "El descuento de inscripción tiene que estar entre 0 y 100" };
  }
  const closureHour = intIn(raw.daily_closure_hour, "La hora del cierre", 0, 23);
  const weekHour = intIn(raw.reservation_week_hour, "La hora de generar reservas", 0, 23);
  const weekDay = intIn(raw.reservation_week_weekday, "El día de generar reservas", 0, 6);
  const overnight = flag(raw.overnight_slot);
  const reservations = flag(raw.module_reservations);
  const classes = flag(raw.module_classes);
  const tournaments = flag(raw.module_tournaments);
  const packs = flag(raw.module_packs);
  const buffet = flag(raw.module_buffet);
  const autoClosure = flag(raw.auto_daily_closure);
  const autoWeek = flag(raw.auto_reservation_week);
  const weekdays = Array.isArray(raw.fixed_weekdays)
    ? Array.from(new Set(raw.fixed_weekdays.map((day) => Number(day)))).sort((a, b) => a - b)
    : [];
  if (weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return { ok: false, error: "Elegí al menos un día para los turnos fijos" };
  }
  const checked = [
    name, shortName, primary, accent, onPrimary, timezone, openTime, closeTime, duration,
    classLimit, closureHour, weekHour, weekDay, overnight, reservations, classes, tournaments,
    packs, buffet, autoClosure, autoWeek,
  ];
  const invalid = checked.find(failed);
  if (invalid) return { ok: false, error: invalid.error };
  if (typeof timezone !== "string" || !isKnownTimezone(timezone)) {
    return { ok: false, error: "La zona horaria no es válida" };
  }
  return {
    ok: true,
    value: {
      name: name as string,
      short_name: shortName as string,
      logo_url: logo,
      primary_color: primary as string,
      accent_color: accent as string,
      on_primary_color: onPrimary as string,
      timezone: timezone as string,
      open_time: openTime as string,
      close_time: closeTime as string,
      slot_duration_minutes: duration as number,
      overnight_slot: overnight as boolean,
      fixed_weekdays: weekdays,
      class_player_limit: classLimit as number,
      registration_discount_percent: Math.round(discount * 100) / 100,
      module_reservations: reservations as boolean,
      module_classes: classes as boolean,
      module_tournaments: tournaments as boolean,
      module_packs: packs as boolean,
      module_buffet: buffet as boolean,
      auto_daily_closure: autoClosure as boolean,
      daily_closure_hour: closureHour as number,
      auto_reservation_week: autoWeek as boolean,
      reservation_week_weekday: weekDay as number,
      reservation_week_hour: weekHour as number,
    },
  };
}

function isKnownTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function clockOf(value: unknown): string {
  return String(value ?? "").slice(0, 5);
}
