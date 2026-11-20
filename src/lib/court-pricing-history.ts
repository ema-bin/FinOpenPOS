export const ORIGINAL_TARIFF_FROM = "1970-01-01";

export type TariffRow = {
  id: number;
  start_time: string;
  end_time: string;
  price_per_player: number | string;
  valid_from: string;
  valid_until: string | null;
};

export type TariffRule = {
  start_time: string;
  end_time: string;
  price_per_player: number;
};

export type TariffPublishPlan = {
  close: Array<{ id: number; valid_until: string }>;
  update: Array<{ id: number; price_per_player: number }>;
  remove: number[];
  insert: TariffRule[];
};

export function clock(value: string): string {
  return value.slice(0, 5);
}

/** El fin 00:00 es la medianoche, después de las 19:00. El fin no entra en el rango. */
export function timeInTariffRange(time: string, start: string, end: string): boolean {
  const at = clock(time);
  const from = clock(start);
  const until = clock(end);
  if (until > from) return at >= from && at < until;
  if (until < from) return at >= from || at < until;
  return false;
}

export function tariffDay(value: string): string {
  return value.slice(0, 10);
}

export function samePrice(a: number | string, b: number | string): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

export function coversTariffDate(
  row: { valid_from: string; valid_until: string | null },
  date: string
): boolean {
  const on = tariffDay(date);
  const from = tariffDay(row.valid_from);
  const until = row.valid_until ? tariffDay(row.valid_until) : null;
  return from <= on && (until === null || on < until);
}

export function tariffUnchanged(plan: TariffPublishPlan): boolean {
  return (
    plan.close.length === 0 &&
    plan.update.length === 0 &&
    plan.remove.length === 0 &&
    plan.insert.length === 0
  );
}

function rangeKey(start: string, end: string): string {
  return `${clock(start)}|${clock(end)}`;
}

export function planTariffPublish(
  openRows: TariffRow[],
  incoming: TariffRule[],
  validFrom: string
): TariffPublishPlan {
  const on = tariffDay(validFrom);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) {
    throw new Error("La fecha de vigencia no es válida.");
  }

  const seen = new Set<string>();
  for (const rule of incoming) {
    const key = rangeKey(rule.start_time, rule.end_time);
    if (seen.has(key)) {
      throw new Error("Hay dos rangos con el mismo horario.");
    }
    seen.add(key);
    if (!Number.isFinite(rule.price_per_player) || rule.price_per_player < 0) {
      throw new Error("El precio no puede ser negativo.");
    }
  }

  const plan: TariffPublishPlan = { close: [], update: [], remove: [], insert: [] };
  const matched = new Set<string>();

  for (const row of openRows) {
    const from = tariffDay(row.valid_from);
    if (from > on) {
      throw new Error(
        `La tarifa vigente empieza el ${from}. Elegí esa fecha o una posterior.`
      );
    }
    const key = rangeKey(row.start_time, row.end_time);
    const next = incoming.find((rule) => rangeKey(rule.start_time, rule.end_time) === key);
    if (!next) {
      if (from === on) plan.remove.push(row.id);
      else plan.close.push({ id: row.id, valid_until: on });
      continue;
    }
    matched.add(key);
    if (samePrice(row.price_per_player, next.price_per_player)) continue;
    if (from === on) {
      plan.update.push({ id: row.id, price_per_player: next.price_per_player });
    } else {
      plan.close.push({ id: row.id, valid_until: on });
      plan.insert.push({
        start_time: clock(next.start_time),
        end_time: clock(next.end_time),
        price_per_player: next.price_per_player,
      });
    }
  }

  for (const rule of incoming) {
    const key = rangeKey(rule.start_time, rule.end_time);
    if (matched.has(key)) continue;
    plan.insert.push({
      start_time: clock(rule.start_time),
      end_time: clock(rule.end_time),
      price_per_player: rule.price_per_player,
    });
  }

  return plan;
}
