export const TEMPLATE_NAME_MAX_LENGTH = 60;
export const TEMPLATE_BODY_MAX_LENGTH = 2000;

type Variant = { id: number };

/** Elige una variante al azar, evitando repetir la actual si hay más de una. */
export function pickRandomVariant<T extends Variant>(
  variants: T[],
  currentId: number | null,
  rng: () => number = Math.random
): T | null {
  if (variants.length === 0) return null;
  const pool =
    variants.length > 1 ? variants.filter((v) => v.id !== currentId) : variants;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}

/** Orden mezclado de variantes que se recorre de a un envío por vez. */
export type VariantRotation = { order: number[]; position: number };

export function createRotation(
  ids: number[],
  rng: () => number = Math.random,
  avoidFirstId: number | null = null
): VariantRotation {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === avoidFirstId) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return { order, position: 0 };
}

export function currentRotationId(rotation: VariantRotation): number | null {
  return rotation.order[rotation.position] ?? null;
}

/** Pasa a la siguiente variante; al completar la vuelta re-mezcla sin repetir la última. */
export function advanceRotation(
  rotation: VariantRotation,
  rng: () => number = Math.random
): VariantRotation {
  if (rotation.order.length === 0) return rotation;
  const next = rotation.position + 1;
  if (next < rotation.order.length) return { ...rotation, position: next };
  return createRotation(rotation.order, rng, currentRotationId(rotation));
}

export type TemplateInputResult =
  | { ok: true; value: { name?: string; body?: string } }
  | { ok: false; error: string };

export function parseTemplateInput(
  raw: unknown,
  options: { partial: boolean }
): TemplateInputResult {
  const input = (raw ?? {}) as { name?: unknown; body?: unknown };
  const value: { name?: string; body?: string } = {};

  if (input.name !== undefined || !options.partial) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return { ok: false, error: "El nombre es requerido" };
    }
    const name = input.name.trim();
    if (name.length > TEMPLATE_NAME_MAX_LENGTH) {
      return { ok: false, error: `El nombre no puede superar ${TEMPLATE_NAME_MAX_LENGTH} caracteres` };
    }
    value.name = name;
  }

  if (input.body !== undefined || !options.partial) {
    if (typeof input.body !== "string" || !input.body.trim()) {
      return { ok: false, error: "El mensaje es requerido" };
    }
    const body = input.body.trim();
    if (body.length > TEMPLATE_BODY_MAX_LENGTH) {
      return { ok: false, error: `El mensaje no puede superar ${TEMPLATE_BODY_MAX_LENGTH} caracteres` };
    }
    value.body = body;
  }

  if (options.partial && value.name === undefined && value.body === undefined) {
    return { ok: false, error: "No hay cambios para guardar" };
  }

  return { ok: true, value };
}
