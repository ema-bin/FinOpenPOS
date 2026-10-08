import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, parseCreateUserInput, parseTemporaryPassword } from "@/lib/auth/create-user-input";

describe("parseCreateUserInput", () => {
  it("normaliza email y nombre", () => {
    expect(
      parseCreateUserInput({
        email: " Ana@Club.com ",
        password: "123456",
        name: " Ana ",
        roleId: 3,
      })
    ).toEqual({
      ok: true,
      value: { email: "ana@club.com", password: "123456", name: "Ana", roleId: 3 },
    });
  });

  it("rechaza contraseñas cortas y roles vacíos", () => {
    expect(parseCreateUserInput({ email: "a@b.com", password: "123", roleId: 1 }).ok).toBe(false);
    expect(parseCreateUserInput({ email: "a@b.com", password: "123456" }).ok).toBe(false);
  });
});

describe("contraseña temporal", () => {
  it("genera la longitud pedida a partir del rng", () => {
    expect(generateTemporaryPassword(10, () => 0)).toBe("AAAAAAAAAA");
    expect(generateTemporaryPassword(3, () => 0.999)).toBe("999");
  });

  it("rechaza menos de 6 caracteres", () => {
    expect(parseTemporaryPassword("12345").ok).toBe(false);
    expect(parseTemporaryPassword("123456")).toEqual({ ok: true, password: "123456" });
  });
});