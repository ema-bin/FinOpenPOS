export type TournamentGroupSlotRange = {
  slot_date: string;
  start_time: string;
  end_time: string;
};

function timeToMinutes(timeStr: string, asEndOfDay = false): number {
  const s = String(timeStr).trim();
  if (asEndOfDay && (s === "00:00" || s === "24:00" || s === "0:00")) return 24 * 60;
  const parts = s.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parts[1] ? parseInt(parts[1], 10) || 0 : 0;
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  if (total >= 24 * 60) return "00:00";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeSlotTime(time: string): string {
  return String(time).trim().substring(0, 5);
}

export function tournamentGroupSlotKey(slot: TournamentGroupSlotRange): string {
  return `${String(slot.slot_date).trim()}|${normalizeSlotTime(slot.start_time)}|${normalizeSlotTime(slot.end_time)}`;
}

export function expandRangesToSlots(
  groupSlots: TournamentGroupSlotRange[],
  matchDurationMinutes: number
): TournamentGroupSlotRange[] {
  const duration = Math.max(15, matchDurationMinutes);
  const expanded: TournamentGroupSlotRange[] = [];

  for (const block of groupSlots) {
    if (
      !block ||
      typeof block.slot_date !== "string" ||
      typeof block.start_time !== "string" ||
      typeof block.end_time !== "string"
    ) {
      continue;
    }
    const slotDate = String(block.slot_date).trim();
    if (!slotDate) continue;

    const startM = timeToMinutes(block.start_time, false);
    const endM = timeToMinutes(block.end_time, true);
    for (let t = startM; t + duration <= endM; t += duration) {
      expanded.push({
        slot_date: slotDate,
        start_time: minutesToTime(t),
        end_time: minutesToTime(t + duration),
      });
    }
  }

  return expanded;
}

export function filterNewSlots(
  candidateSlots: TournamentGroupSlotRange[],
  existingSlots: TournamentGroupSlotRange[]
): TournamentGroupSlotRange[] {
  const existingKeys = new Set(existingSlots.map(tournamentGroupSlotKey));
  const seen = new Set<string>();
  const out: TournamentGroupSlotRange[] = [];

  for (const slot of candidateSlots) {
    const key = tournamentGroupSlotKey(slot);
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }

  return out;
}
