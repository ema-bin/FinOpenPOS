/** De cada cobro: el profesor de esa clase, los socios y Emanuel. */

export const CLASS_PROFESSOR_PERCENT = 60;
export const CLASS_PARTNERS_PERCENT = 30;
export const CLASS_EMANUEL_PERCENT = 10;

export type ClassCollectionSplit = {
  professorShare: number;
  partnersShare: number;
  emanuelShare: number;
};

/** Las tres partes suman el monto. El resto de los redondeos queda en las canchas. */
export function splitClassCollection(amount: number): ClassCollectionSplit {
  const cents = Math.round(amount * 100);
  const professor = Math.round((cents * CLASS_PROFESSOR_PERCENT) / 100);
  const emanuel = Math.round((cents * CLASS_EMANUEL_PERCENT) / 100);
  const partners = cents - professor - emanuel;
  return {
    professorShare: professor / 100,
    partnersShare: partners / 100,
    emanuelShare: emanuel / 100,
  };
}

export type PaidShareRow = {
  status: "pending" | "paid";
  amount: number;
  professorName: string;
  paymentMethodName: string | null;
  professorShare: number | null;
  partnersShare: number | null;
  emanuelShare: number | null;
};

export type ClassCollectionSummary = {
  collected: number;
  professorTotal: number;
  partnersTotal: number;
  emanuelTotal: number;
  byProfessor: Array<{ name: string; amount: number }>;
  byMethod: Array<{ name: string; amount: number }>;
};

export type DueClassSummary = {
  total: number;
  courts: number;
  emanuel: number;
  byProfessor: Array<{ name: string; amount: number }>;
};

/** Reparte el total a cobrar del mes: 60% del profe de cada clase, 30% canchas, 10% Emanuel. */
export function summarizeDueClassShares(
  charges: Array<{ amount: number; professorName: string }>
): DueClassSummary {
  const byProfessor = new Map<string, number>();
  let total = 0;
  let courts = 0;
  let emanuel = 0;
  for (const charge of charges) {
    const split = splitClassCollection(charge.amount);
    total += charge.amount;
    courts += split.partnersShare;
    emanuel += split.emanuelShare;
    byProfessor.set(charge.professorName, (byProfessor.get(charge.professorName) ?? 0) + split.professorShare);
  }
  return {
    total,
    courts,
    emanuel,
    byProfessor: Array.from(byProfessor)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "es")),
  };
}

export function summarizePaidClassShares(charges: PaidShareRow[]): ClassCollectionSummary {
  const byProfessor = new Map<string, number>();
  const byMethod = new Map<string, number>();
  let collected = 0;
  let professorTotal = 0;
  let partnersTotal = 0;
  let emanuelTotal = 0;

  for (const charge of charges) {
    if (charge.status !== "paid") continue;
    const split =
      charge.professorShare != null && charge.partnersShare != null && charge.emanuelShare != null
        ? {
            professorShare: charge.professorShare,
            partnersShare: charge.partnersShare,
            emanuelShare: charge.emanuelShare,
          }
        : splitClassCollection(charge.amount);
    collected += charge.amount;
    professorTotal += split.professorShare;
    partnersTotal += split.partnersShare;
    emanuelTotal += split.emanuelShare;
    byProfessor.set(charge.professorName, (byProfessor.get(charge.professorName) ?? 0) + split.professorShare);
    const method = charge.paymentMethodName ?? "Sin medio";
    byMethod.set(method, (byMethod.get(method) ?? 0) + charge.amount);
  }

  const sortMoney = (entries: Array<[string, number]>) =>
    entries
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "es"));

  return {
    collected,
    professorTotal,
    partnersTotal,
    emanuelTotal,
    byProfessor: sortMoney(Array.from(byProfessor)),
    byMethod: sortMoney(Array.from(byMethod)),
  };
}
