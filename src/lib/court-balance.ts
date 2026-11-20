import { coversTariffDate, timeInTariffRange } from "@/lib/court-pricing-history";

export type CourtBalanceSeat = {
  paymentMethodId: number | null;
  paymentMethodName: string | null;
  consumesCredit: boolean;
};

export type CourtBalanceSlot = {
  id: number;
  courtId: number | null;
  courtName: string;
  startTime: string;
  endTime: string;
  wasPlayed: boolean;
  seats: CourtBalanceSeat[];
};

export type CourtBalanceTariff = {
  courtId: number;
  startTime: string;
  endTime: string;
  pricePerPlayer: number | string;
  validFrom: string;
  validUntil: string | null;
};

export type CourtBalancePack = {
  id: number;
  paymentMethodId: number | null;
  paymentMethodName: string | null;
  amountPaid: number | string;
  playerName: string;
  packName: string;
};

export type CourtDayBalance = {
  date: string;
  playedSlots: number;
  slotRevenueCents: number;
  packRevenueCents: number;
  totalRevenueCents: number;
  creditUses: number;
  missingTariff: number;
  unpaidSeats: number;
  courts: Array<{
    courtId: number | null;
    courtName: string;
    playedSlots: number;
    revenueCents: number;
    unpaidSeats: number;
  }>;
  payments: Array<{
    paymentMethodId: number | null;
    paymentMethodName: string;
    uses: number;
    revenueCents: number;
    creditUses: number;
    packCount: number;
    packRevenueCents: number;
    priceUses: Array<{ priceCents: number | null; count: number }>;
  }>;
  packs: Array<{
    id: number;
    playerName: string;
    packName: string;
    paymentMethodName: string;
    amountCents: number;
  }>;
  unpaid: Array<{
    courtName: string;
    timeRange: string;
    seats: number;
  }>;
};

function cents(value: number | string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function clock(value: string): string {
  return value.slice(0, 5);
}

function priceCents(
  tariffs: CourtBalanceTariff[],
  courtId: number | null,
  time: string,
  date: string
): number | null {
  if (courtId == null) return null;
  const matches = tariffs.filter(
    (row) =>
      row.courtId === courtId &&
      coversTariffDate({ valid_from: row.validFrom, valid_until: row.validUntil }, date) &&
      timeInTariffRange(time, row.startTime, row.endTime)
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => clock(b.startTime).localeCompare(clock(a.startTime)));
  return cents(matches[0].pricePerPlayer);
}

export function buildCourtDayBalance(input: {
  date: string;
  slots: CourtBalanceSlot[];
  tariffs: CourtBalanceTariff[];
  packs: CourtBalancePack[];
}): CourtDayBalance {
  const courts = new Map<
    string,
    CourtDayBalance["courts"][number]
  >();
  const payments = new Map<string, Omit<CourtDayBalance["payments"][number], "priceUses">>();
  const priceUses = new Map<string, Map<number | "missing", number>>();
  const unpaid: CourtDayBalance["unpaid"] = [];
  let playedSlots = 0;
  let slotRevenueCents = 0;
  let creditUses = 0;
  let missingTariff = 0;
  let unpaidSeats = 0;

  for (const slot of input.slots) {
    if (!slot.wasPlayed) continue;
    playedSlots += 1;
    const courtName = slot.courtName || "Sin cancha";
    const courtKey = slot.courtId != null ? `id:${slot.courtId}` : `name:${courtName}`;
    const court = courts.get(courtKey) ?? {
      courtId: slot.courtId,
      courtName,
      playedSlots: 0,
      revenueCents: 0,
      unpaidSeats: 0,
    };
    court.playedSlots += 1;

    let slotUnpaid = 0;
    for (const seat of slot.seats) {
      if (seat.paymentMethodId == null) {
        slotUnpaid += 1;
        unpaidSeats += 1;
        court.unpaidSeats += 1;
        continue;
      }
      const methodName = seat.paymentMethodName?.trim() || `Método #${seat.paymentMethodId}`;
      const payKey = `id:${seat.paymentMethodId}`;
      const payment = payments.get(payKey) ?? {
        paymentMethodId: seat.paymentMethodId,
        paymentMethodName: methodName,
        uses: 0,
        revenueCents: 0,
        creditUses: 0,
        packCount: 0,
        packRevenueCents: 0,
      };
      payment.uses += 1;
      const price = priceCents(input.tariffs, slot.courtId, slot.startTime, input.date);
      const counted = priceUses.get(payKey) ?? new Map<number | "missing", number>();
      if (price == null) {
        missingTariff += 1;
        counted.set("missing", (counted.get("missing") ?? 0) + 1);
      } else {
        counted.set(price, (counted.get(price) ?? 0) + 1);
        if (!seat.consumesCredit) {
          payment.revenueCents += price;
          court.revenueCents += price;
          slotRevenueCents += price;
        }
      }
      if (seat.consumesCredit) {
        payment.creditUses += 1;
        creditUses += 1;
      }
      priceUses.set(payKey, counted);
      payments.set(payKey, payment);
    }

    courts.set(courtKey, court);
    if (slotUnpaid > 0) {
      unpaid.push({
        courtName,
        timeRange: `${clock(slot.startTime)} – ${clock(slot.endTime)}`,
        seats: slotUnpaid,
      });
    }
  }

  const packLines = input.packs.map((pack) => {
    const amountCents = cents(pack.amountPaid);
    const methodName = pack.paymentMethodName?.trim() || (pack.paymentMethodId != null ? `Método #${pack.paymentMethodId}` : "Sin medio");
    const payKey = pack.paymentMethodId != null ? `id:${pack.paymentMethodId}` : `name:${methodName}`;
    const payment = payments.get(payKey) ?? {
      paymentMethodId: pack.paymentMethodId,
      paymentMethodName: methodName,
      uses: 0,
      revenueCents: 0,
      creditUses: 0,
      packCount: 0,
      packRevenueCents: 0,
    };
    payment.packCount += 1;
    payment.packRevenueCents += amountCents;
    payments.set(payKey, payment);
    return {
      id: pack.id,
      playerName: pack.playerName.trim() || "Sin jugador",
      packName: pack.packName,
      paymentMethodName: methodName,
      amountCents,
    };
  });
  const packRevenueCents = packLines.reduce((sum, pack) => sum + pack.amountCents, 0);

  return {
    date: input.date,
    playedSlots,
    slotRevenueCents,
    packRevenueCents,
    totalRevenueCents: slotRevenueCents + packRevenueCents,
    creditUses,
    missingTariff,
    unpaidSeats,
    courts: Array.from(courts.values()).sort((a, b) => a.courtName.localeCompare(b.courtName, "es")),
    payments: Array.from(payments.entries())
      .map(([key, payment]) => ({
        ...payment,
        priceUses: Array.from(priceUses.get(key)?.entries() ?? [])
          .map(([price, count]) => ({
            priceCents: price === "missing" ? null : price,
            count,
          }))
          .sort((a, b) => (b.priceCents ?? -1) - (a.priceCents ?? -1)),
      }))
      .sort((a, b) => (b.revenueCents + b.packRevenueCents) - (a.revenueCents + a.packRevenueCents) || a.paymentMethodName.localeCompare(b.paymentMethodName, "es")),
    packs: packLines,
    unpaid,
  };
}
