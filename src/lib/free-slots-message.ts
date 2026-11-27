import { WEEKDAY_LABELS, addDaysIso, weekdayOf } from "@/lib/class-time";

export type FreeSlotInput = {
  court_id: number;
  start_time: string;
  was_played: boolean;
  reservation_status: "free" | "reserved";
  reservation_source: "manual" | "fixed" | null;
  class_block: { label: string } | null;
  tournament_block: { label: string } | null;
};

function minutesOf(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + (minute || 0);
}

/** Mismo criterio que la celda verde del calendario. */
export function slotIsFree(slot: FreeSlotInput): boolean {
  return (
    !slot.was_played &&
    !slot.tournament_block &&
    !slot.class_block &&
    slot.reservation_status !== "reserved" &&
    slot.reservation_source !== "fixed"
  );
}

/** Minutos desde el inicio del día del club. Lo de después de medianoche va al final. */
function dayOrder(clock: string, openMinutes: number): number {
  const minutes = minutesOf(clock);
  return minutes < openMinutes ? minutes + 1440 : minutes;
}

/**
 * Día del club y minuto desde el que se publican turnos.
 * Si el club cierra de madrugada, hasta esa hora sigue siendo el día anterior.
 */
export function freeSlotsStart(input: {
  date: string;
  hour: number;
  minute: number;
  openTime: string;
  closeTime: string;
  overnight: boolean;
}): { date: string; fromOrder: number } {
  const open = minutesOf(input.openTime);
  const close = minutesOf(input.closeTime);
  const now = input.hour * 60 + input.minute;
  if (input.overnight && close <= open && now < close) {
    return { date: addDaysIso(input.date, -1), fromOrder: now + 1440 };
  }
  return { date: input.date, fromOrder: now };
}

function joinCourts(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function freeSlotsBlock(input: {
  date: string;
  slots: FreeSlotInput[];
  courts: Array<{ id: number; name: string }>;
  openTime: string;
  fromOrder?: number;
}): string {
  const open = minutesOf(input.openTime);
  const from = input.fromOrder ?? -1;
  const courtIndex = new Map(input.courts.map((court, index) => [court.id, index]));
  const byStart = new Map<string, number[]>();
  for (const slot of input.slots) {
    if (!slotIsFree(slot) || !courtIndex.has(slot.court_id)) continue;
    const start = slot.start_time.slice(0, 5);
    if (dayOrder(start, open) < from) continue;
    const list = byStart.get(start) ?? [];
    if (!list.includes(slot.court_id)) list.push(slot.court_id);
    byStart.set(start, list);
  }
  const lines = Array.from(byStart.entries())
    .sort(([a], [b]) => dayOrder(a, open) - dayOrder(b, open))
    .map(([start, ids]) => {
      const names = ids
        .sort((a, b) => courtIndex.get(a)! - courtIndex.get(b)!)
        .map((id) => input.courts[courtIndex.get(id)!].name);
      return `-${start} hs ${joinCourts(names)}`;
    });
  const title = `*TURNOS LIBRES ${WEEKDAY_LABELS[weekdayOf(input.date)].toLocaleUpperCase("es-AR")}:*`;
  return [title, ...(lines.length > 0 ? lines : ["Sin turnos libres"])].join("\n");
}
