import { describe, expect, it } from "vitest";
import {
  buildDebtDetail,
  buildDebtReminderMessage,
  computeDebtSummary,
  formatDebtAmount,
  type DebtReminderOrder,
} from "@/lib/debt-reminder-message";

function makeOrder(overrides: Partial<DebtReminderOrder> = {}): DebtReminderOrder {
  return {
    player: { first_name: "Juan", last_name: "Pérez" },
    total_amount: 9000,
    items: [
      { quantity: 2, unit_price: 2500, product: { name: "Gatorade" } },
      { quantity: 1, unit_price: 4000, product: { name: "Tubo de pelotas" } },
    ],
    ...overrides,
  };
}

describe("formatDebtAmount", () => {
  it("formatea con separador de miles es-AR y sin decimales si es entero", () => {
    expect(formatDebtAmount(12500)).toBe("$12.500");
  });

  it("muestra decimales cuando corresponde", () => {
    expect(formatDebtAmount(1234.5)).toBe("$1.234,5");
  });
});

describe("computeDebtSummary", () => {
  it("calcula total desde ítems y saldo como total - pagado", () => {
    const summary = computeDebtSummary(makeOrder({ amount_paid: 3000 }));
    expect(summary).toEqual({
      subtotal: 9000,
      discount: 0,
      total: 9000,
      paid: 3000,
      balance: 6000,
    });
  });

  it("aplica descuento porcentual", () => {
    const summary = computeDebtSummary(makeOrder({ discount_percentage: 10 }));
    expect(summary.discount).toBe(900);
    expect(summary.total).toBe(8100);
    expect(summary.balance).toBe(8100);
  });

  it("prioriza balance_due del servidor si viene", () => {
    const summary = computeDebtSummary(makeOrder({ amount_paid: 1000, balance_due: 7500 }));
    expect(summary.balance).toBe(7500);
  });

  it("sin ítems usa total_amount", () => {
    const summary = computeDebtSummary(makeOrder({ items: undefined, total_amount: 4200 }));
    expect(summary.total).toBe(4200);
    expect(summary.balance).toBe(4200);
  });

  it("el saldo nunca es negativo", () => {
    const summary = computeDebtSummary(makeOrder({ amount_paid: 20000 }));
    expect(summary.balance).toBe(0);
  });
});

describe("buildDebtDetail", () => {
  it("lista ítems con cantidad, nombre y subtotal, y cierra con el saldo", () => {
    const detail = buildDebtDetail(makeOrder({ amount_paid: 3000 }));
    expect(detail).toBe(
      [
        "*Detalle de la cuenta:*",
        "• 2 x Gatorade: $5.000",
        "• 1 x Tubo de pelotas: $4.000",
        "Total: $9.000",
        "Pagado: $3.000",
        "*Saldo pendiente: $6.000*",
      ].join("\n")
    );
  });

  it("incluye subtotal y descuento cuando hay descuento", () => {
    const detail = buildDebtDetail(makeOrder({ discount_amount: 1000 }));
    expect(detail).toContain("Subtotal: $9.000");
    expect(detail).toContain("Descuento: -$1.000");
    expect(detail).toContain("Total: $8.000");
    expect(detail).not.toContain("Pagado");
  });

  it("usa 'Producto' si el ítem no tiene nombre", () => {
    const detail = buildDebtDetail(
      makeOrder({ items: [{ quantity: 1, unit_price: 100, product: null }] })
    );
    expect(detail).toContain("• 1 x Producto: $100");
  });
});

describe("buildDebtReminderMessage", () => {
  it("menciona que es un recordatorio, el nombre y el saldo", () => {
    const msg = buildDebtReminderMessage(makeOrder(), { includeDetail: false });
    expect(msg).toMatch(/^Hola Juan!/);
    expect(msg).toContain("recordarte");
    expect(msg).toContain("*$9.000*");
    expect(msg).not.toContain("Detalle de la cuenta");
    expect(msg).not.toContain("{detalle}");
    expect(msg).not.toMatch(/\n{3,}/);
  });

  it("incluye el detalle cuando se pide", () => {
    const msg = buildDebtReminderMessage(makeOrder(), { includeDetail: true });
    expect(msg).toContain("*Detalle de la cuenta:*");
    expect(msg).toContain("• 2 x Gatorade: $5.000");
    expect(msg).toContain("*Saldo pendiente: $9.000*");
  });

  it("acepta plantilla custom con placeholders", () => {
    const msg = buildDebtReminderMessage(makeOrder(), {
      includeDetail: false,
      template: "{nombre_completo} debe {saldo}",
    });
    expect(msg).toBe("Juan Pérez debe $9.000");
  });

  it("sin jugador no deja espacios raros en el saludo", () => {
    const msg = buildDebtReminderMessage(makeOrder({ player: null }), { includeDetail: false });
    expect(msg).toMatch(/^Hola!/);
  });
});
