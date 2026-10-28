import { describe, expect, it } from "vitest";
import { argentinaMonthBounds, sumPurchases } from "@/lib/month-purchases";

describe("argentinaMonthBounds", () => {
  const october = argentinaMonthBounds("2026-10");

  it("incluye el mediodía UTC del día elegido", () => {
    const noon = new Date("2026-10-19T12:00:00.000Z").getTime();
    expect(noon).toBeGreaterThanOrEqual(new Date(october.from).getTime());
    expect(noon).toBeLessThanOrEqual(new Date(october.to).getTime());
  });

  it("deja en octubre una compra de las 22 de Argentina del último día", () => {
    const late = new Date("2026-11-01T01:00:00.000Z").getTime();
    expect(late).toBeLessThanOrEqual(new Date(october.to).getTime());
  });

  it("no incluye la última hora de septiembre", () => {
    const previous = new Date("2026-10-01T02:00:00.000Z").getTime();
    expect(previous).toBeLessThan(new Date(october.from).getTime());
  });
});

describe("sumPurchases", () => {
  it("redondea el total a centavos", () => {
    expect(
      sumPurchases([
        { id: 1, date: "2026-10-01", supplierName: "A", paymentMethodName: null, totalAmount: 10.1 },
        { id: 2, date: "2026-10-02", supplierName: "B", paymentMethodName: "Efectivo", totalAmount: 0.2 },
      ])
    ).toBe(10.3);
  });
});