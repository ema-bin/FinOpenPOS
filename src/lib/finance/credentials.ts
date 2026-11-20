import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const CREDENTIALS_KEY_VERSION = 1;

export class CredentialsKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsKeyError";
  }
}

export class TokenFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenFormatError";
  }
}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

const TOKEN = /^\S{20,500}$/;

/** 32 bytes, en hexadecimal (64 caracteres) o en base64. */
export function parseCredentialsKey(raw: string | undefined): Buffer {
  const value = raw?.trim() ?? "";
  if (!value) {
    throw new CredentialsKeyError("Falta FINANCE_CREDENTIALS_KEY en el servidor.");
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  const decoded = Buffer.from(value, "base64");
  const canonical = decoded.toString("base64").replace(/=+$/, "");
  const given = value.replace(/=+$/, "");
  if (decoded.length === 32 && canonical === given) return decoded;
  throw new CredentialsKeyError("FINANCE_CREDENTIALS_KEY tiene que ser 32 bytes en base64 o en hexadecimal.");
}

export function loadCredentialsKey(): Buffer {
  return parseCredentialsKey(process.env.FINANCE_CREDENTIALS_KEY);
}

export function assertAccessToken(value: unknown): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (!TOKEN.test(token)) {
    throw new TokenFormatError("El access token no es válido.");
  }
  return token;
}

export function encryptAccessToken(token: string, key: Buffer): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: CREDENTIALS_KEY_VERSION,
  };
}

export function decryptAccessToken(secret: EncryptedSecret, key: Buffer): string {
  if (secret.keyVersion !== CREDENTIALS_KEY_VERSION) {
    throw new CredentialsKeyError("Ese token se guardó con otra versión de clave.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
