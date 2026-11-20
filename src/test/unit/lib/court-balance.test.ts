import { describe, expect, it } from "vitest";
import { buildCourtDayBalance, type CourtBalanceSlot, type CourtBalanceTariff } from "@/lib/court-balance";

const tariff = (patch: Partial<CourtBalanceTariff> & Pick<CourtBalanceTariff, "startTime" | "endTime" | "pricePerPlayer">): CourtBalanceTariff => ({
  courtId: 1,
  validFrom: "2026-11-22",
  validUntil: null,
  ...patch,
});

function slot(patch: Partial<CourtBalanceSlot> & Pick<CourtBalanceSlot, "startTime" | "seats">): CourtBalanceSlot {
  return {
    id: 1,
    courtId: 1,
    courtName: "C1",
    endTime: "21:00",
    wasPlayed: true,
    ...patch,
  };
}

describe("buildCourtDayBalance", () => {
  it("cobra las 20:30 con la franja que termina a medianoche", () => {
    const balance = buildCourtDayBalance({
      date: "2026-11-22",
      tariffs: [
        tariff({ startTime: "07:00", endTime: "19:00", pricePerPlayer: 12000 }),
        tariff({ startTime: "19:00", endTime: "00:00", pricePerPlayer: 13000 }),
      ],
      slots: [slot({ startTime: "20:30", seats: [{ paymentMethodId: 3, paymentMethodName: "Efectivo", consumesCredit: false }] })],
      packs: [],
    });
    expect(balance.slotRevenueCents).toBe(1_300_000);
    expect(balance.missingTariff).toBe(0);
  });

  it("no suma el uso de un crédito y sí suma la venta del pack", () => {
    const balance = buildCourtDayBalance({
      date: "2026-11-22",
      tariffs: [tariff({ startTime: "19:00", endTime: "00:00", pricePerPlayer: 13000 })],
      slots: [slot({ startTime: "20:30", seats: [{ paymentMethodId: 8, paymentMethodName: "QR", consumesCredit: true }] })],
      packs: [{ id: 4, paymentMethodId: 5, paymentMethodName: "Transferencia", amountPaid: 50000, playerName: "Ana", packName: "Pack 10" }],
    });
    expect(balance.slotRevenueCents).toBe(0);
    expect(balance.creditUses).toBe(1);
    expect(balance.packRevenueCents).toBe(5_000_000);
    expect(balance.totalRevenueCents).toBe(5_000_000);
    expect(balance.payments).toEqual([
      expect.objectContaining({
        paymentMethodId: 5,
        paymentMethodName: "Transferencia",
        uses: 0,
        packCount: 1,
        packRevenueCents: 5_000_000,
      }),
      expect.objectContaining({
        paymentMethodId: 8,
        revenueCents: 0,
        creditUses: 1,
        packRevenueCents: 0,
        priceUses: [{ priceCents: 1_300_000, count: 1 }],
      }),
    ]);
  });

  it("agrupa por cancha y no usa una tarifa que todavía no rige", () => {
    const balance = buildCourtDayBalance({
      date: "2026-11-21",
      tariffs: [tariff({ courtId: 2, startTime: "10:00", endTime: "13:00", pricePerPlayer: 8000, validFrom: "2026-11-22" })],
      slots: [
        slot({
          id: 2,
          courtId: 2,
          courtName: "Cancha 2",
          startTime: "10:00",
          seats: [{ paymentMethodId: 1, paymentMethodName: "Efectivo", consumesCredit: false }],
        }),
      ],
      packs: [],
    });
    expect(balance.slotRevenueCents).toBe(0);
    expect(balance.missingTariff).toBe(1);
    expect(balance.courts.map((court) => court.courtName)).toEqual(["Cancha 2"]);
    expect(balance.payments[0].priceUses).toEqual([{ priceCents: null, count: 1 }]);
  });

  it("separa los usos de un medio según el precio de cada horario", () => {
    const balance = buildCourtDayBalance({
      date: "2026-11-22",
      tariffs: [
        tariff({ startTime: "07:00", endTime: "19:00", pricePerPlayer: 12000 }),
        tariff({ startTime: "19:00", endTime: "00:00", pricePerPlayer: 13000 }),
      ],
      slots: [
        slot({
          id: 1,
          startTime: "10:00",
          seats: [
            { paymentMethodId: 3, paymentMethodName: "Efectivo", consumesCredit: false },
            { paymentMethodId: 3, paymentMethodName: "Efectivo", consumesCredit: false },
          ],
        }),
        slot({
          id: 2,
          startTime: "20:30",
          seats: [{ paymentMethodId: 3, paymentMethodName: "Efectivo", consumesCredit: false }],
        }),
      ],
      packs: [],
    });
    expect(balance.payments[0].priceUses).toEqual([
      { priceCents: 1_300_000, count: 1 },
      { priceCents: 1_200_000, count: 2 },
    ]);
  });
});
