import { describe, expect, it } from "vitest";
import {
  computeDiscountAndTotal,
  isMoneyPositive,
  bodySetsPositiveDiscount,
  parseDiscountBodyField,
  resolveOrderDiscounts,
  roundMoney,
  sumPayments,
} from "@/lib/order-payment-helpers";

describe("order-payment-helpers (lib)", () => {
  it("roundMoney redondea a centavos", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });

  it("computeDiscountAndTotal aplica porcentaje", () => {
    const { discountValue, finalTotal } = computeDiscountAndTotal(100, 10, null);
    expect(discountValue).toBe(10);
    expect(finalTotal).toBe(90);
  });

  it("computeDiscountAndTotal prioriza monto fijo sobre porcentaje", () => {
    const { discountValue, finalTotal } = computeDiscountAndTotal(100, 10, 25);
    expect(discountValue).toBe(25);
    expect(finalTotal).toBe(75);
  });

  it("parseDiscountBodyField respeta null explícito", () => {
    expect(parseDiscountBodyField({ discount_amount: null }, "discount_amount")).toBeNull();
    expect(parseDiscountBodyField({}, "discount_amount")).toBeUndefined();
  });

  it("resolveOrderDiscounts usa body cuando viene definido", () => {
    expect(
      resolveOrderDiscounts({ discount_percentage: 5, discount_amount: null }, {
        discount_percentage: 15,
      })
    ).toEqual({ discountPercentage: 15, discountAmount: null });
  });

  it("bodySetsPositiveDiscount solo cuenta un descuento mayor a cero", () => {
    expect(bodySetsPositiveDiscount({ discount_percentage: 10 })).toBe(true);
    expect(bodySetsPositiveDiscount({ discount_amount: "50" })).toBe(true);
    expect(bodySetsPositiveDiscount({ discount_percentage: null })).toBe(false);
    expect(bodySetsPositiveDiscount({ discount_amount: 0 })).toBe(false);
    expect(bodySetsPositiveDiscount({})).toBe(false);
    expect(bodySetsPositiveDiscount(null)).toBe(false);
  });

  it("sumPayments e isMoneyPositive", () => {
    expect(sumPayments([{ id: 1, amount: 10.5, created_at: "", payment_method_id: 1, payment_method: null }])).toBe(10.5);
    expect(isMoneyPositive(0)).toBe(false);
    expect(isMoneyPositive(0.01)).toBe(true);
  });
});
