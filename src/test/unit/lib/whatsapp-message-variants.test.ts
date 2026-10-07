import { describe, expect, it } from "vitest";
import {
  TEMPLATE_BODY_MAX_LENGTH,
  advanceRotation,
  createRotation,
  currentRotationId,
  parseTemplateInput,
  pickRandomVariant,
} from "@/lib/whatsapp-message-variants";

const variants = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("pickRandomVariant", () => {
  it("devuelve null sin variantes", () => {
    expect(pickRandomVariant([], null)).toBeNull();
  });

  it("con una sola variante la devuelve aunque sea la actual", () => {
    expect(pickRandomVariant([{ id: 7 }], 7)).toEqual({ id: 7 });
  });

  it("nunca repite la actual si hay más de una", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickRandomVariant(variants, 2, () => r)?.id).not.toBe(2);
    }
  });

  it("usa el rng para elegir dentro del pool", () => {
    expect(pickRandomVariant(variants, 1, () => 0)?.id).toBe(2);
    expect(pickRandomVariant(variants, 1, () => 0.99)?.id).toBe(3);
  });
});

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("rotación de variantes", () => {
  it("sin variantes no hay variante actual y avanzar no rompe", () => {
    const r = createRotation([]);
    expect(currentRotationId(r)).toBeNull();
    expect(advanceRotation(r)).toEqual(r);
  });

  it("la rotación contiene todas las variantes una sola vez", () => {
    const r = createRotation([1, 2, 3, 4], seededRng(7));
    expect([...r.order].sort()).toEqual([1, 2, 3, 4]);
    expect(r.position).toBe(0);
  });

  it("cada envío pasa a otra variante y no repite dentro de una vuelta", () => {
    let r = createRotation([1, 2, 3, 4], seededRng(1));
    const sent: number[] = [];
    for (let i = 0; i < 4; i++) {
      sent.push(currentRotationId(r)!);
      r = advanceRotation(r, seededRng(i + 10));
    }
    expect(new Set(sent).size).toBe(4);
  });

  it("nunca repite la misma variante en dos envíos seguidos, incluso al cambiar de vuelta", () => {
    const rng = seededRng(42);
    let r = createRotation([1, 2, 3], rng);
    let prev = currentRotationId(r);
    for (let i = 0; i < 50; i++) {
      r = advanceRotation(r, rng);
      const curr = currentRotationId(r);
      expect(curr).not.toBe(prev);
      prev = curr;
    }
  });

  it("con una sola variante siempre devuelve esa", () => {
    let r = createRotation([5]);
    r = advanceRotation(r);
    expect(currentRotationId(r)).toBe(5);
  });

  it("avoidFirstId evita arrancar con esa variante", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(currentRotationId(createRotation([1, 2], seededRng(seed), 1))).toBe(2);
    }
  });
});

describe("parseTemplateInput", () => {
  it("creación exige nombre y mensaje, y los recorta", () => {
    expect(parseTemplateInput({ name: "  Corto ", body: " Hola {nombre} " }, { partial: false }))
      .toEqual({ ok: true, value: { name: "Corto", body: "Hola {nombre}" } });
  });

  it("creación sin nombre falla", () => {
    const r = parseTemplateInput({ body: "x" }, { partial: false });
    expect(r).toEqual({ ok: false, error: "El nombre es requerido" });
  });

  it("creación con mensaje vacío falla", () => {
    const r = parseTemplateInput({ name: "a", body: "   " }, { partial: false });
    expect(r.ok).toBe(false);
  });

  it("edición parcial acepta solo body", () => {
    expect(parseTemplateInput({ body: "nuevo" }, { partial: true })).toEqual({
      ok: true,
      value: { body: "nuevo" },
    });
  });

  it("edición sin campos falla", () => {
    expect(parseTemplateInput({}, { partial: true }).ok).toBe(false);
  });

  it("rechaza mensajes demasiado largos", () => {
    const r = parseTemplateInput(
      { name: "a", body: "x".repeat(TEMPLATE_BODY_MAX_LENGTH + 1) },
      { partial: false }
    );
    expect(r.ok).toBe(false);
  });
});
