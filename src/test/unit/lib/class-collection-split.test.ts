import { describe, expect, it } from "vitest";
import { splitClassCollection, summarizeDueClassShares, summarizePaidClassShares } from "@/lib/class-collection-split";

describe("reparto de una clase", () => {
  it("parte 10000 en 60, 30 y 10", () => {
    expect(splitClassCollection(10000)).toEqual({
      professorShare: 6000,
      partnersShare: 3000,
      emanuelShare: 1000,
    });
  });

  it("las tres partes suman el monto aunque no cierre redondo", () => {
    for (const amount of [0, 1, 33.33, 100.01, 99999.99]) {
      const split = splitClassCollection(amount);
      const total = Math.round((split.professorShare + split.partnersShare + split.emanuelShare) * 100);
      expect(total).toBe(Math.round(amount * 100));
    }
  });

  it("suma lo cobrado por profe, socios, Emanuel y por la bolsa donde entró", () => {
    const summary = summarizePaidClassShares([
      {
        status: "paid",
        amount: 10000,
        professorName: "Seba",
        paymentMethodName: "pcp.clases.efectivo",
        professorShare: 6000,
        partnersShare: 3000,
        emanuelShare: 1000,
      },
      {
        status: "paid",
        amount: 20000,
        professorName: "Manu",
        paymentMethodName: "pcp.clases.manu",
        professorShare: 12000,
        partnersShare: 6000,
        emanuelShare: 2000,
      },
      {
        status: "pending",
        amount: 5000,
        professorName: "Seba",
        paymentMethodName: "pcp.clases.seba",
        professorShare: null,
        partnersShare: null,
        emanuelShare: null,
      },
    ]);

    expect(summary.collected).toBe(30000);
    expect(summary.professorTotal).toBe(18000);
    expect(summary.partnersTotal).toBe(9000);
    expect(summary.emanuelTotal).toBe(3000);
    expect(summary.byProfessor).toEqual([
      { name: "Manu", amount: 12000 },
      { name: "Seba", amount: 6000 },
    ]);
    expect(summarizeDueClassShares([
      { amount: 10000, professorName: "Seba" },
      { amount: 20000, professorName: "Manu" },
    ])).toEqual({
      total: 30000,
      courts: 9000,
      emanuel: 3000,
      byProfessor: [
        { name: "Manu", amount: 12000 },
        { name: "Seba", amount: 6000 },
      ],
    });
    expect(summary.byMethod).toEqual([
      { name: "pcp.clases.manu", amount: 20000 },
      { name: "pcp.clases.efectivo", amount: 10000 },
    ]);
  });
});
