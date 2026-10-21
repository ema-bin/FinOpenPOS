import { describe, expect, it } from "vitest";
import { buildClassPaymentReminder, classMonthLabel } from "@/lib/class-payment-reminder";

describe("classMonthLabel", () => {
  it("escribe el mes en español", () => {
    expect(classMonthLabel("2026-10")).toBe("octubre 2026");
  });
});

describe("buildClassPaymentReminder", () => {
  it("arma un recordatorio corto con nombre, mes, profesor y monto", () => {
    const message = buildClassPaymentReminder({
      firstName: "Francisco",
      yearMonth: "2026-10",
      professorName: "Seba",
      amount: 45000,
      account: "pcp.clases.seba",
    });
    expect(message).toMatch(/^Hola Francisco!/);
    expect(message).toContain("recordarte");
    expect(message).toContain("octubre 2026");
    expect(message).toContain("Seba");
    expect(message).toContain("*$45.000*");
    expect(message).toContain("transferir a la cuenta *pcp.clases.seba*");
    expect(message).toContain("comprobante");
    expect(message).not.toContain("{nombre}");
    expect(message).not.toContain("{cuenta}");
  });

  it("saluda sin nombre si el jugador no tiene", () => {
    const message = buildClassPaymentReminder({
      firstName: "",
      yearMonth: "2026-03",
      professorName: "Manu",
      amount: 1000,
    });
    expect(message).toMatch(/^Hola!/);
    expect(message).toContain("marzo 2026");
    expect(message).toContain("mandarnos el comprobante");
    expect(message).not.toContain("la cuenta *");
  });
});
