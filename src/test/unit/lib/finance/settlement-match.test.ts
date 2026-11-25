import { describe, expect, it } from "vitest";
import {
  chargeFromSeat,
  crossSettlements,
  reconcileDates,
  reconcileMonth,
  reconciliationTone,
  type ExpectedCharge,
  type SettlementMovement,
} from "@/lib/finance/settlement-match";

const methodId = 2;

function charge(patch: Partial<ExpectedCharge> & Pick<ExpectedCharge, "key" | "amountCents" | "label">): ExpectedCharge {
  return {
    kind: "court_seat",
    paymentMethodId: methodId,
    courtSlotId: 10,
    seatIndex: 1,
    packId: null,
    ...patch,
  };
}

function movement(patch: Partial<SettlementMovement> & Pick<SettlementMovement, "id" | "amountCents">): SettlementMovement {
  return {
    paymentMethodId: methodId,
    sourceId: String(patch.id),
    transactionType: "SETTLEMENT",
    paymentMethodType: "account_money",
    businessUnit: "mercadopago",
    subUnit: "qr",
    at: "2026-11-23T15:00:00.000Z",
    ...patch,
  };
}

describe("color de la diferencia", () => {
  it("cierra en cero, y el tono cambia a los $5.000 y a los $20.000", () => {
    expect(reconciliationTone(0)).toEqual({ tone: "even", label: "Cierra" });
    expect(reconciliationTone(499_999).tone).toBe("favor-small");
    expect(reconciliationTone(500_000).tone).toBe("favor-medium");
    expect(reconciliationTone(1_999_999).tone).toBe("favor-medium");
    expect(reconciliationTone(2_000_000).tone).toBe("favor-large");
    expect(reconciliationTone(-499_999).tone).toBe("against-small");
    expect(reconciliationTone(-500_000).tone).toBe("against-medium");
    expect(reconciliationTone(-2_000_000).label).toBe("En contra, grande");
  });

  it("suma el mes por día y no mete el rendimiento en lo que entró", () => {
    const days = reconcileDates({
      dates: ["2026-11-23", "2026-11-24"],
      paymentMethodIds: [methodId],
      charges: [{ ...charge({ key: "seat:10:1", amountCents: 1_000_000, label: "Central" }), date: "2026-11-23" }],
      rows: [
        { ...movement({ id: 1, amountCents: 1_000_000 }), date: "2026-11-23" },
        { ...movement({ id: 2, amountCents: 50_000, paymentMethodType: null, businessUnit: null, subUnit: null }), date: "2026-11-23" },
      ],
      marks: [],
    });
    expect(days).toEqual([
      { date: "2026-11-23", expectedCents: 1_000_000, collectedCents: 1_000_000 },
      { date: "2026-11-24", expectedCents: 0, collectedCents: 0 },
    ]);
  });

  it("separa el mes por medio de pago", () => {
    const other = 8;
    const result = reconcileMonth({
      dates: ["2026-11-23", "2026-11-24"],
      paymentMethodIds: [methodId, other],
      charges: [
        { ...charge({ key: "seat:10:1", amountCents: 1_000_000, label: "Central" }), date: "2026-11-23" },
        { ...charge({ key: "seat:11:1", amountCents: 500_000, label: "Cancha 2", paymentMethodId: other }), date: "2026-11-24" },
      ],
      rows: [
        { ...movement({ id: 1, amountCents: 1_000_000 }), date: "2026-11-23" },
        { ...movement({ id: 3, amountCents: 400_000, paymentMethodId: other }), date: "2026-11-24" },
        { ...movement({ id: 2, amountCents: 50_000, paymentMethodType: null, businessUnit: null, subUnit: null }), date: "2026-11-23" },
      ],
      marks: [],
    });
    expect(result.methods).toEqual([
      { paymentMethodId: methodId, expectedCents: 1_000_000, collectedCents: 1_000_000 },
      { paymentMethodId: other, expectedCents: 500_000, collectedCents: 400_000 },
    ]);
    expect(result.days[0].expectedCents).toBe(1_000_000);
    expect(result.days[1]).toEqual({ date: "2026-11-24", expectedCents: 500_000, collectedCents: 400_000 });
  });
});

describe("cruce de liquidaciones", () => {
  it("no cruza el uso de un crédito y deja afuera el turno sin tarifa", () => {
    expect(chargeFromSeat({
      paymentMethodId: methodId,
      consumesCredit: true,
      amountCents: 1_000_000,
      courtSlotId: 10,
      seatIndex: 1,
      label: "Central",
    })).toBe("skip");
    expect(chargeFromSeat({
      paymentMethodId: methodId,
      consumesCredit: false,
      amountCents: null,
      courtSlotId: 10,
      seatIndex: 1,
      label: "Central",
    })).toBe("missing");
  });

  it("separa el rendimiento y no lo suma con los cobros", () => {
    const result = crossSettlements({
      paymentMethodIds: [methodId],
      charges: [charge({ key: "seat:10:1", amountCents: 1_000_000, label: "Central 20:30–22:00" })],
      rows: [
        movement({ id: 1, amountCents: 1_000_000 }),
        movement({
          id: 2,
          amountCents: 68_224,
          sourceId: "1753365476297",
          paymentMethodType: null,
          businessUnit: "",
          subUnit: null,
        }),
      ],
      marks: [],
    })[0];
    expect(result.collectedCents).toBe(1_000_000);
    expect(result.yieldCents).toBe(68_224);
    expect(result.rows.find((row) => row.id === 2)?.effectiveKind).toBe("yield");
  });

  it("propone el único turno del monto y no lo deja marcado", () => {
    const row = crossSettlements({
      paymentMethodIds: [methodId],
      charges: [charge({ key: "seat:10:1", courtSlotId: 10, amountCents: 1_000_000, label: "Central 20:30–22:00" })],
      rows: [movement({ id: 1, amountCents: 1_000_000 })],
      marks: [],
    })[0].rows[0];
    expect(row.mark).toBeNull();
    expect(row.suggestion?.label).toBe("Central 20:30–22:00");
    expect(row.ambiguous).toBe(false);
  });

  it("no elige cancha cuando dos turnos valen lo mismo", () => {
    const row = crossSettlements({
      paymentMethodIds: [methodId],
      charges: [
        charge({ key: "seat:10:1", courtSlotId: 10, amountCents: 1_000_000, label: "Central 20:30–22:00" }),
        charge({ key: "seat:11:1", courtSlotId: 11, amountCents: 1_000_000, label: "Cancha 2 20:30–22:00" }),
      ],
      rows: [movement({ id: 1, amountCents: 1_000_000, sourceId: "190" })],
      marks: [],
    })[0].rows[0];
    expect(row.suggestion).toBeNull();
    expect(row.ambiguous).toBe(true);
    expect(row.candidates.map((candidate) => candidate.label)).toEqual([
      "Central 20:30–22:00",
      "Cancha 2 20:30–22:00",
    ]);
  });

  it("mantiene dos filas aunque compartan SOURCE_ID y no suma un retiro", () => {
    const result = crossSettlements({
      paymentMethodIds: [methodId],
      charges: [],
      rows: [
        movement({ id: 1, amountCents: 500_000, sourceId: "190839674778" }),
        movement({ id: 2, amountCents: -500_000, sourceId: "190839674778", transactionType: "REFUND" }),
        movement({ id: 3, amountCents: 5_000_000, transactionType: "WITHDRAWAL", paymentMethodType: null, businessUnit: null, subUnit: null }),
      ],
      marks: [],
    })[0];
    expect(result.rows).toHaveLength(3);
    expect(result.collectedCents).toBe(500_000);
    expect(result.refundCents).toBe(-500_000);
    expect(result.withdrawalCents).toBe(5_000_000);
    expect(result.rows.filter((row) => row.sourceId === "190839674778")).toHaveLength(2);
  });

  it("después de marcar un turno, el otro cobro del mismo monto queda único", () => {
    const charges = [
      charge({ key: "seat:10:1", courtSlotId: 10, seatIndex: 1, amountCents: 1_000_000, label: "Central" }),
      charge({ key: "seat:11:1", courtSlotId: 11, seatIndex: 1, amountCents: 1_000_000, label: "Cancha 2" }),
    ];
    const rows = [
      movement({ id: 1, amountCents: 1_000_000 }),
      movement({ id: 2, amountCents: 1_000_000 }),
    ];
    const open = crossSettlements({ paymentMethodIds: [methodId], charges, rows, marks: [] })[0];
    expect(open.rows.every((row) => row.suggestion == null && row.ambiguous)).toBe(true);

    const marked = crossSettlements({
      paymentMethodIds: [methodId],
      charges,
      rows,
      marks: [{ rowId: 1, kind: "court_seat", courtSlotId: 10, seatIndex: 1, packId: null }],
    })[0];
    expect(marked.rows.find((row) => row.id === 1)?.matched?.label).toBe("Central");
    expect(marked.rows.find((row) => row.id === 2)?.suggestion?.label).toBe("Cancha 2");
  });
});
