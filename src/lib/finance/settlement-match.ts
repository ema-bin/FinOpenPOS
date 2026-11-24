export type SettlementKind = "collection" | "yield" | "withdrawal" | "refund";

export type ChargeKind = "court_seat" | "pack";

export type ExpectedCharge = {
  key: string;
  kind: ChargeKind;
  paymentMethodId: number;
  amountCents: number;
  courtSlotId: number | null;
  seatIndex: number | null;
  packId: number | null;
  label: string;
};

export type SettlementMovement = {
  id: number;
  paymentMethodId: number;
  sourceId: string | null;
  transactionType: string | null;
  paymentMethodType: string | null;
  businessUnit: string | null;
  subUnit: string | null;
  amountCents: number;
  at: string | null;
};

export type SettlementMarkInput = {
  rowId: number;
  kind: ChargeKind | "yield" | "withdrawal" | "ignored";
  courtSlotId: number | null;
  seatIndex: number | null;
  packId: number | null;
};

export type SettlementCrossRow = {
  id: number;
  paymentMethodId: number;
  sourceId: string | null;
  at: string | null;
  amountCents: number;
  kind: SettlementKind;
  effectiveKind: SettlementKind | "ignored";
  mark: SettlementMarkInput | null;
  matched: ExpectedCharge | null;
  suggestion: ExpectedCharge | null;
  ambiguous: boolean;
  candidates: ExpectedCharge[];
};

export type SettlementCrossMethod = {
  paymentMethodId: number;
  expectedCents: number;
  collectedCents: number;
  yieldCents: number;
  withdrawalCents: number;
  refundCents: number;
  rows: SettlementCrossRow[];
};

const SMALL_DIFF_CENTS = 500_000;
const MEDIUM_DIFF_CENTS = 2_000_000;

export type ReconciliationTone =
  | "even"
  | "favor-small"
  | "favor-medium"
  | "favor-large"
  | "against-small"
  | "against-medium"
  | "against-large";

/** A favor: entró más de lo registrado. En contra: entró menos. $5.000 y $20.000 cambian la intensidad. */
export function reconciliationTone(differenceCents: number): { tone: ReconciliationTone; label: string } {
  if (differenceCents === 0) return { tone: "even", label: "Cierra" };
  const favor = differenceCents > 0;
  const size = Math.abs(differenceCents) < SMALL_DIFF_CENTS
    ? "small"
    : Math.abs(differenceCents) < MEDIUM_DIFF_CENTS
      ? "medium"
      : "large";
  const tone = `${favor ? "favor" : "against"}-${size}` as Exclude<ReconciliationTone, "even">;
  const label = {
    "favor-small": "A favor, chica",
    "favor-medium": "A favor",
    "favor-large": "A favor, grande",
    "against-small": "En contra, chica",
    "against-medium": "En contra",
    "against-large": "En contra, grande",
  }[tone];
  return { tone, label };
}

function blank(value: string | null): boolean {
  return value == null || value.trim() === "";
}

/** Un cobro de cancha trae medio, unidad o subunidad. Si los tres vienen vacíos, es rendimiento. */
export function settlementKind(
  row: Pick<SettlementMovement, "transactionType" | "paymentMethodType" | "businessUnit" | "subUnit">,
): SettlementKind {
  const type = (row.transactionType ?? "").trim().toUpperCase();
  if (type === "WITHDRAWAL" || type === "PAYOUT" || type.includes("WITHDRAW")) return "withdrawal";
  if (type === "REFUND" || type === "CHARGEBACK" || type === "DISPUTE") return "refund";
  if (blank(row.paymentMethodType) && blank(row.businessUnit) && blank(row.subUnit)) return "yield";
  return "collection";
}

export function chargeKey(charge: {
  kind: ChargeKind;
  courtSlotId: number | null;
  seatIndex: number | null;
  packId: number | null;
}): string {
  return charge.kind === "pack"
    ? `pack:${charge.packId}`
    : `seat:${charge.courtSlotId}:${charge.seatIndex}`;
}

/** El uso de un crédito no es un cobro. Sin tarifa no hay monto para cruzar. */
export function chargeFromSeat(input: {
  paymentMethodId: number | null;
  consumesCredit: boolean;
  amountCents: number | null;
  courtSlotId: number;
  seatIndex: number;
  label: string;
}): ExpectedCharge | "skip" | "missing" {
  if (input.paymentMethodId == null || input.consumesCredit) return "skip";
  if (input.amountCents == null) return "missing";
  return {
    key: chargeKey({ kind: "court_seat", courtSlotId: input.courtSlotId, seatIndex: input.seatIndex, packId: null }),
    kind: "court_seat",
    paymentMethodId: input.paymentMethodId,
    amountCents: input.amountCents,
    courtSlotId: input.courtSlotId,
    seatIndex: input.seatIndex,
    packId: null,
    label: input.label,
  };
}

function markKey(mark: SettlementMarkInput): string | null {
  if (mark.kind === "pack") {
    return chargeKey({ kind: "pack", courtSlotId: null, seatIndex: null, packId: mark.packId });
  }
  if (mark.kind === "court_seat") {
    return chargeKey({ kind: "court_seat", courtSlotId: mark.courtSlotId, seatIndex: mark.seatIndex, packId: null });
  }
  return null;
}

function effectiveKind(kind: SettlementKind, mark: SettlementMarkInput | null): SettlementCrossRow["effectiveKind"] {
  if (!mark) return kind;
  if (mark.kind === "court_seat" || mark.kind === "pack") return "collection";
  return mark.kind;
}

/**
 * Cruza cobros de Mercado Pago con turnos y packs del mismo medio.
 * No elige una cancha cuando el monto aparece más de una vez.
 * El rendimiento, los retiros y las devoluciones no entran en la suma de cobros.
 */
export function crossSettlements(input: {
  paymentMethodIds: number[];
  charges: ExpectedCharge[];
  rows: SettlementMovement[];
  marks: SettlementMarkInput[];
}): SettlementCrossMethod[] {
  const markOf = new Map(input.marks.map((mark) => [mark.rowId, mark]));
  const chargeOf = new Map(input.charges.map((charge) => [charge.key, charge]));

  return input.paymentMethodIds.map((paymentMethodId) => {
    const charges = input.charges.filter((charge) => charge.paymentMethodId === paymentMethodId);
    const rows = input.rows
      .filter((row) => row.paymentMethodId === paymentMethodId)
      .slice()
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || a.id - b.id);
    const crossed = rows.map((row) => {
      const kind = settlementKind(row);
      const mark = markOf.get(row.id) ?? null;
      const effect = effectiveKind(kind, mark);
      const ownKey = mark ? markKey(mark) : null;
      const taken = new Set(
        input.marks
          .filter((item) => item.rowId !== row.id)
          .map(markKey)
          .filter((key): key is string => key != null),
      );
      const candidates = effect === "collection" && row.amountCents > 0
        ? charges.filter((charge) => charge.amountCents === row.amountCents && !taken.has(charge.key))
        : [];
      const sameAmount = rows.filter((other) => {
        if (other.id === row.id || settlementKind(other) !== "collection" || other.amountCents !== row.amountCents) return false;
        const otherMark = markOf.get(other.id);
        return !otherMark || otherMark.kind === "court_seat" || otherMark.kind === "pack";
      });
      const openRows = sameAmount.filter((other) => {
        const otherMark = markOf.get(other.id);
        return !otherMark || (otherMark.kind !== "court_seat" && otherMark.kind !== "pack");
      });
      const confirmed = ownKey != null;
      const suggestion = !confirmed && candidates.length === 1 && openRows.length === 0 ? candidates[0] : null;
      const ambiguous = !confirmed && effect === "collection" && row.amountCents > 0 && suggestion == null && candidates.length > 0;
      return {
        id: row.id,
        paymentMethodId,
        sourceId: row.sourceId,
        at: row.at,
        amountCents: row.amountCents,
        kind,
        effectiveKind: effect,
        mark,
        matched: ownKey ? chargeOf.get(ownKey) ?? null : null,
        suggestion,
        ambiguous,
        candidates: confirmed ? [] : candidates,
      };
    });

    const sum = (kind: SettlementCrossRow["effectiveKind"]) =>
      crossed.filter((row) => row.effectiveKind === kind).reduce((total, row) => total + row.amountCents, 0);

    return {
      paymentMethodId,
      expectedCents: charges.reduce((total, charge) => total + charge.amountCents, 0),
      collectedCents: sum("collection"),
      yieldCents: sum("yield"),
      withdrawalCents: sum("withdrawal"),
      refundCents: sum("refund"),
      rows: crossed,
    };
  });
}
