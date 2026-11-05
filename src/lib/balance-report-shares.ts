export type ShareKey = "marina" | "cintia";

export const SHARE_PARTS: Array<{ key: ShareKey; label: string }> = [
  { key: "marina", label: "Marina Leffler" },
  { key: "cintia", label: "Cintia Leffler" },
];

export type NamedWithdrawal = {
  amount: number;
  partner?: { first_name: string; last_name: string } | null;
};

export type ShareProposal = {
  key: ShareKey;
  label: string;
  half: number;
  already: number;
  proposed: number;
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toCents(amount: number) {
  return Math.round(amount * 100);
}

function fromCents(cents: number) {
  return cents / 100;
}

/** Marina Leffler y Cintia Leffler. */
export function withdrawalPersonName(
  partner?: { first_name: string; last_name: string } | null,
  partnerId?: number | null
) {
  if (partner) return `${partner.first_name} ${partner.last_name}`;
  if (partnerId) return `Socio ${partnerId}`;
  return "Sin socio";
}

export function shareKeyFor(
  partner?: { first_name: string; last_name: string } | null
): ShareKey | null {
  if (!partner) return null;
  const first = normalizeName(partner.first_name);
  const last = normalizeName(partner.last_name);
  if (!last.startsWith("leff")) return null;
  if (first === "marina") return "marina";
  if (first === "cintia") return "cintia";
  return null;
}

/**
 * La mitad sale de ventas − compras + ajustes, menos retiros de otra persona.
 * A cada una se le resta solo lo que ella ya retiró.
 */
export function buildShareProposal(input: {
  sales: number;
  purchases: number;
  adjustmentsTotal: number;
  withdrawals: NamedWithdrawal[];
}): { parts: [ShareProposal, ShareProposal]; otherWithdrawn: number } {
  const taken = { marina: 0, cintia: 0, other: 0 };
  input.withdrawals.forEach((withdrawal) => {
    const key = shareKeyFor(withdrawal.partner);
    taken[key ?? "other"] += toCents(withdrawal.amount);
  });

  const distributable =
    toCents(input.sales) -
    toCents(input.purchases) +
    toCents(input.adjustmentsTotal) -
    taken.other;
  const marinaHalf = Math.floor(distributable / 2);
  const cintiaHalf = distributable - marinaHalf;
  const halves = { marina: marinaHalf, cintia: cintiaHalf };

  const parts = SHARE_PARTS.map((part) => ({
    key: part.key,
    label: part.label,
    half: fromCents(halves[part.key]),
    already: fromCents(taken[part.key]),
    proposed: fromCents(halves[part.key] - taken[part.key]),
  })) as [ShareProposal, ShareProposal];

  return { parts, otherWithdrawn: fromCents(taken.other) };
}
