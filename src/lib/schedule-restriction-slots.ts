import { toHHMM } from "@/lib/build-schedule-days-from-slots";

export type RestrictionSlotRef = {
  id: number;
  slot_date: string;
  start_time: string;
};

function dateTimeKey(date: string, time: string): string {
  return `${date.trim().slice(0, 10)}\t${toHHMM(time)}`;
}

/** Todos los slots de ese día y hora. En la revisión conjunta hay uno por torneo. */
export function slotIdsAtDateTime(
  slots: readonly RestrictionSlotRef[],
  matchDate: string,
  startTime: string
): number[] {
  const key = dateTimeKey(matchDate, startTime);
  const ids: number[] = [];
  for (const slot of slots) {
    if (dateTimeKey(slot.slot_date, slot.start_time) === key) ids.push(slot.id);
  }
  return ids;
}

/** La pareja no puede si alguno de esos slots está en su lista (cada torneo tiene sus propios ids). */
export function cannotPlayAnySlot(
  restrictedSlotIds: readonly number[] | null | undefined,
  slotIds: readonly number[]
): boolean {
  if (!restrictedSlotIds?.length || slotIds.length === 0) return false;
  const atTime = new Set(slotIds);
  return restrictedSlotIds.some((id) => atTime.has(id));
}
