import type { PlayoffScheduleSlot } from "@/lib/playoff-schedule-slots";

export type PlayoffTournamentSlotNeed = {
  id: number;
  needing: number;
};

function sortSlotsChronologically(
  slots: PlayoffScheduleSlot[]
): PlayoffScheduleSlot[] {
  return [...slots].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    const byTime = a.startTime.localeCompare(b.startTime);
    if (byTime !== 0) return byTime;
    return a.court_id - b.court_id;
  });
}

/**
 * Reparte slots entre torneos en round-robin por franja horaria (misma fecha+hora = simultáneo).
 * Cada torneo recibe sus slots ordenados cronológicamente para asignar rondas en orden.
 */
export function interleavePlayoffSlotsAcrossTournaments(
  sharedSlots: PlayoffScheduleSlot[],
  plans: PlayoffTournamentSlotNeed[]
): Map<number, PlayoffScheduleSlot[]> {
  const result = new Map<number, PlayoffScheduleSlot[]>();
  const remaining = new Map(plans.map((p) => [p.id, p.needing]));
  for (const plan of plans) {
    result.set(plan.id, []);
  }

  if (plans.length === 0 || sharedSlots.length === 0) {
    return result;
  }

  const waveKey = (slot: PlayoffScheduleSlot) =>
    `${slot.date}|${slot.startTime}`;
  const waves = new Map<string, PlayoffScheduleSlot[]>();
  const waveOrder: string[] = [];

  for (const slot of sharedSlots) {
    const key = waveKey(slot);
    if (!waves.has(key)) {
      waves.set(key, []);
      waveOrder.push(key);
    }
    waves.get(key)!.push(slot);
  }

  waveOrder.sort();

  let planIdx = 0;

  for (const key of waveOrder) {
    const waveSlots = [...(waves.get(key) ?? [])].sort(
      (a, b) => a.court_id - b.court_id
    );

    for (const slot of waveSlots) {
      const anyRemaining = plans.some((p) => (remaining.get(p.id) ?? 0) > 0);
      if (!anyRemaining) break;

      let tries = 0;
      while (tries < plans.length) {
        const plan = plans[planIdx % plans.length];
        planIdx++;
        tries++;
        const left = remaining.get(plan.id) ?? 0;
        if (left > 0) {
          result.get(plan.id)!.push(slot);
          remaining.set(plan.id, left - 1);
          break;
        }
      }
    }
  }

  for (const plan of plans) {
    result.set(plan.id, sortSlotsChronologically(result.get(plan.id) ?? []));
  }

  return result;
}
