import { monthBounds } from "./class-time";

export type ChargeEnrollment = {
  playerId: number;
  professorId: number;
  scheduleId: number;
  startedOn: string;
  endedOn: string | null;
};

export type ChargeRate = {
  professorId: number;
  weeklyCount: number;
  amount: number;
};

export type ExistingCharge = {
  playerId: number;
  professorId: number;
  status: "pending" | "paid";
};

export type ChargeDraft = {
  playerId: number;
  professorId: number;
  weeklyCount: number;
  amount: number;
  action: "insert" | "update";
};

export type MissingClassRate = {
  playerId: number;
  professorId: number;
  weeklyCount: number;
};

/**
 * Una deuda por jugador y profesor.
 * La cantidad es cuántas clases fijas de ese profesor se superponen con el mes.
 */
export function planMonthlyCharges(
  yearMonth: string,
  enrollments: ChargeEnrollment[],
  rates: ChargeRate[],
  existing: ExistingCharge[]
): { drafts: ChargeDraft[]; missing: MissingClassRate[] } {
  const bounds = monthBounds(yearMonth);
  if (!bounds) return { drafts: [], missing: [] };

  const schedulesByPair = new Map<string, Set<number>>();
  for (const enrollment of enrollments) {
    if (enrollment.startedOn > bounds.end) continue;
    if (enrollment.endedOn && enrollment.endedOn < bounds.start) continue;
    const key = `${enrollment.playerId}:${enrollment.professorId}`;
    const schedules = schedulesByPair.get(key) ?? new Set<number>();
    schedules.add(enrollment.scheduleId);
    schedulesByPair.set(key, schedules);
  }

  const rateByKey = new Map<string, number>();
  for (const rate of rates) {
    rateByKey.set(`${rate.professorId}:${rate.weeklyCount}`, rate.amount);
  }

  const existingByPair = new Map<string, ExistingCharge>();
  for (const charge of existing) {
    existingByPair.set(`${charge.playerId}:${charge.professorId}`, charge);
  }

  const drafts: ChargeDraft[] = [];
  const missing: MissingClassRate[] = [];

  for (const [key, schedules] of Array.from(schedulesByPair)) {
    const [playerIdText, professorIdText] = key.split(":");
    const playerId = Number(playerIdText);
    const professorId = Number(professorIdText);
    const weeklyCount = schedules.size;
    const current = existingByPair.get(key);
    if (current?.status === "paid") continue;

    const amount = rateByKey.get(`${professorId}:${weeklyCount}`);
    if (amount === undefined) {
      missing.push({ playerId, professorId, weeklyCount });
      continue;
    }

    drafts.push({
      playerId,
      professorId,
      weeklyCount,
      amount,
      action: current ? "update" : "insert",
    });
  }

  drafts.sort((a, b) => a.professorId - b.professorId || a.playerId - b.playerId);
  missing.sort((a, b) => a.professorId - b.professorId || a.playerId - b.playerId);
  return { drafts, missing };
}
