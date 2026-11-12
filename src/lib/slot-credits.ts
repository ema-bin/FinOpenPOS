export type CreditSeat = {
  paymentMethodId: number | null;
  playerId: number | null;
};

export type CreditMethodRef = {
  id: number;
  name: string;
  consumes_slot_credit?: boolean | null;
};

export function methodConsumesCredit(
  method: { name?: string | null; consumes_slot_credit?: boolean | null } | null | undefined
): boolean {
  if (!method) return false;
  if (method.consumes_slot_credit) return true;
  return (method.name ?? "").toUpperCase().includes("QR");
}

function consumingCounts(
  wasPlayed: boolean,
  seats: CreditSeat[],
  methods: CreditMethodRef[]
): { counts: Map<number, number>; missingPlayer: boolean } {
  const counts = new Map<number, number>();
  if (!wasPlayed) return { counts, missingPlayer: false };
  const byId = new Map(methods.map((method) => [method.id, method]));
  for (const seat of seats) {
    if (seat.paymentMethodId == null) continue;
    const method = byId.get(seat.paymentMethodId);
    if (!method || !methodConsumesCredit(method)) continue;
    if (seat.playerId == null) return { counts, missingPlayer: true };
    counts.set(seat.playerId, (counts.get(seat.playerId) ?? 0) + 1);
  }
  return { counts, missingPlayer: false };
}

/** null si se puede guardar. balances null = todavía no cargaron y no se frena por saldo. */
export function creditSaveError(input: {
  wasPlayed: boolean;
  seats: CreditSeat[];
  savedWasPlayed: boolean;
  savedSeats: CreditSeat[];
  methods: CreditMethodRef[];
  balances: ReadonlyMap<number, number> | null;
  playerNames?: ReadonlyMap<number, string>;
}): string | null {
  const desired = consumingCounts(input.wasPlayed, input.seats, input.methods);
  if (desired.missingPlayer) return "Elegí un jugador con créditos";
  if (!input.balances) return null;

  const saved = consumingCounts(input.savedWasPlayed, input.savedSeats, input.methods);
  for (const [playerId, count] of Array.from(desired.counts)) {
    const extra = count - (saved.counts.get(playerId) ?? 0);
    if (extra <= 0) continue;
    const balance = input.balances.get(playerId) ?? 0;
    if (extra > balance) {
      const name = input.playerNames?.get(playerId);
      return name
        ? `${name} no tiene créditos suficientes`
        : "El jugador no tiene créditos disponibles";
    }
  }
  return null;
}

export function seatsFromSlot(slot: {
  player1_payment_method?: { id: number } | null;
  player2_payment_method?: { id: number } | null;
  player3_payment_method?: { id: number } | null;
  player4_payment_method?: { id: number } | null;
  player1_id?: number | null;
  player2_id?: number | null;
  player3_id?: number | null;
  player4_id?: number | null;
  player1?: { id: number } | null;
  player2?: { id: number } | null;
  player3?: { id: number } | null;
  player4?: { id: number } | null;
}): CreditSeat[] {
  return [
    {
      paymentMethodId: slot.player1_payment_method?.id ?? null,
      playerId: slot.player1_id ?? slot.player1?.id ?? null,
    },
    {
      paymentMethodId: slot.player2_payment_method?.id ?? null,
      playerId: slot.player2_id ?? slot.player2?.id ?? null,
    },
    {
      paymentMethodId: slot.player3_payment_method?.id ?? null,
      playerId: slot.player3_id ?? slot.player3?.id ?? null,
    },
    {
      paymentMethodId: slot.player4_payment_method?.id ?? null,
      playerId: slot.player4_id ?? slot.player4?.id ?? null,
    },
  ];
}
