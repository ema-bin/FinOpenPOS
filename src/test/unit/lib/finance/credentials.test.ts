import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertAccessToken,
  decryptAccessToken,
  encryptAccessToken,
  parseCredentialsKey,
  TokenFormatError,
  CredentialsKeyError,
} from "@/lib/finance/credentials";
import { courtMethodsForBalance, paymentCredentialStatus } from "@/lib/finance/payment-credentials";

const token = "APP_USR-1234567890abcdefghij";

describe("clave de credenciales", () => {
  const key = randomBytes(32);

  it("acepta 32 bytes en base64 o en hexadecimal", () => {
    expect(parseCredentialsKey(key.toString("base64")).equals(key)).toBe(true);
    expect(parseCredentialsKey(key.toString("hex")).equals(key)).toBe(true);
  });

  it("rechaza una clave vacía o de otro tamaño", () => {
    expect(() => parseCredentialsKey("")).toThrow(CredentialsKeyError);
    expect(() => parseCredentialsKey(randomBytes(16).toString("base64"))).toThrow(CredentialsKeyError);
  });
});

describe("access token cifrado", () => {
  const key = randomBytes(32);

  it("vuelve a leer el mismo token y no guarda el texto", () => {
    const secret = encryptAccessToken(token, key);
    expect(secret.ciphertext.includes(token)).toBe(false);
    expect(secret.iv).not.toBe(encryptAccessToken(token, key).iv);
    expect(decryptAccessToken(secret, key)).toBe(token);
  });

  it("no abre el token con otra clave ni si lo alteran", () => {
    const secret = encryptAccessToken(token, key);
    expect(() => decryptAccessToken(secret, randomBytes(32))).toThrow();
    expect(() =>
      decryptAccessToken({ ...secret, ciphertext: Buffer.from("otro").toString("base64") }, key),
    ).toThrow();
  });

  it("pide un token sin espacios, de largo razonable", () => {
    expect(assertAccessToken(`  ${token}  `)).toBe(token);
    expect(() => assertAccessToken("corto")).toThrow(TokenFormatError);
    expect(() => assertAccessToken(`${token} con espacio`)).toThrow(TokenFormatError);
  });
});

describe("estado del medio de pago", () => {
  it("lista solo los medios de cancha marcados como Mercado Pago", () => {
    const status = paymentCredentialStatus(
      [
        { id: 2, name: "Efectivo", scope: "BOTH", is_active: true, is_mercadopago: false },
        { id: 8, name: "Mercado Pago", scope: "COURT", is_active: true, is_mercadopago: true },
        { id: 9, name: "Cantina MP", scope: "BAR", is_active: true, is_mercadopago: true },
      ],
      [{ payment_method_id: 8, updated_at: "2026-11-20T12:00:00.000Z" }],
    );
    expect(status.map((row) => row.name)).toEqual(["Mercado Pago"]);
    expect(status.find((row) => row.id === 8)).toMatchObject({
      configured: true,
      updatedAt: "2026-11-20T12:00:00.000Z",
    });
  });

  it("en el balance muestra el efectivo y deja afuera la cantina", () => {
    const shown = courtMethodsForBalance(
      [
        { id: 2, name: "Efectivo", scope: "BOTH", is_active: true },
        { id: 8, name: "Mercado Pago", scope: "COURT", is_active: true },
        { id: 9, name: "Cantina", scope: "BAR", is_active: true },
        { id: 4, name: "Viejo", scope: "COURT", is_active: false },
        { id: 5, name: "Transferencia", scope: "COURT", is_active: false },
      ],
      new Set([5]),
    );
    expect(shown.map((row) => row.name)).toEqual(["Efectivo", "Mercado Pago", "Transferencia"]);
  });
});
