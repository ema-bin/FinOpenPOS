import type {
  ScheduleConfig,
  ScheduleDay,
  SchedulePhysicalSlotCourtSelection,
} from "@/models/dto/tournament";
import { slotIntervalMinutesForPlayoffScheduling } from "@/lib/playoff-match-duration";
import { expandPhysicalWindowsToPlayoffSlotList } from "@/lib/playoff-expand-selected-slots";

export type PlayoffScheduleSlot = {
  date: string;
  startTime: string;
  court_id: number;
};

export function parsePlayoffScheduleSelections(
  body: Record<string, unknown>
): SchedulePhysicalSlotCourtSelection[] {
  const raw = body.selectedPhysicalSlots;
  if (!Array.isArray(raw)) return [];
  const out: SchedulePhysicalSlotCourtSelection[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const slotId = Number(r.tournamentGroupSlotId ?? r.slotId);
    const courtId = Number(r.courtId);
    const slotDate = String(r.slotDate ?? "").trim().slice(0, 10);
    const startTime = String(r.startTime ?? "").trim().slice(0, 5);
    const endTime = String(r.endTime ?? "").trim().slice(0, 5);
    if (!Number.isFinite(courtId) || courtId <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) continue;
    if (!startTime || !endTime) continue;
    const hasSlotId = Number.isFinite(slotId) && slotId > 0;
    out.push({
      tournamentGroupSlotId: hasSlotId ? slotId : undefined,
      courtId,
      slotDate,
      startTime,
      endTime,
    });
  }
  return out;
}

export function parseExplicitPlayoffSlots(
  body: Record<string, unknown>
): PlayoffScheduleSlot[] | null {
  const raw = body.explicitPlayoffSlots;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PlayoffScheduleSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const date = String(r.date ?? r.slotDate ?? "").trim().slice(0, 10);
    const startTime = String(r.startTime ?? "").trim().slice(0, 5);
    const courtId = Number(r.court_id ?? r.courtId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!startTime) continue;
    if (!Number.isFinite(courtId) || courtId <= 0) continue;
    out.push({ date, startTime, court_id: courtId });
  }
  return out.length > 0 ? out : null;
}

export function parseScheduleConfigFromBody(
  body: Record<string, unknown>
): ScheduleConfig | undefined {
  const selectedPhysicalSlotsFromBody = parsePlayoffScheduleSelections(body);
  const hasPhysicalScheduling = selectedPhysicalSlotsFromBody.length > 0;

  const bodyDaysUnknown = body.days as unknown;
  const hasLegacyDaysGrid =
    Array.isArray(bodyDaysUnknown) &&
    bodyDaysUnknown.length > 0 &&
    bodyDaysUnknown.every(
      (d: unknown) =>
        d !== null &&
        typeof d === "object" &&
        typeof (d as { date?: unknown }).date === "string" &&
        String((d as { date?: string }).date!).trim().length >= 10
    );

  if (hasPhysicalScheduling) {
    const courtIdsParsed = Array.isArray(body.courtIds)
      ? (body.courtIds as unknown[])
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const courtIdsFromSelections: number[] = [];
    if (courtIdsParsed.length === 0) {
      const seen = new Map<number, true>();
      for (const row of selectedPhysicalSlotsFromBody) {
        if (seen.has(row.courtId)) continue;
        seen.set(row.courtId, true);
        courtIdsFromSelections.push(row.courtId);
      }
    }
    return {
      days: [],
      matchDuration: Number(body.matchDuration) || 60,
      courtIds:
        courtIdsParsed.length > 0 ? courtIdsParsed : courtIdsFromSelections,
      selectedPhysicalSlots: selectedPhysicalSlotsFromBody,
    };
  }

  if (hasLegacyDaysGrid) {
    return {
      days: body.days as ScheduleDay[],
      matchDuration: Number(body.matchDuration) || 60,
      courtIds: Array.isArray(body.courtIds)
        ? (body.courtIds as number[])
        : [],
    };
  }

  return undefined;
}

function generateTimeSlots(
  days: ScheduleDay[],
  matchDuration: number,
  numCourts: number
): Array<{ date: string; startTime: string; endTime: string }> {
  const slots: Array<{ date: string; startTime: string; endTime: string }> = [];

  days.forEach((day) => {
    const [startH, startM] = day.startTime.split(":").map(Number);
    const [endH, endM] = day.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    let currentMinutes = startMinutes;
    while (currentMinutes + matchDuration <= endMinutes) {
      const slotStartH = Math.floor(currentMinutes / 60);
      const slotStartM = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + matchDuration;
      const slotEndH = Math.floor(slotEndMinutes / 60);
      const slotEndM = slotEndMinutes % 60;

      for (let i = 0; i < numCourts; i++) {
        slots.push({
          date: day.date,
          startTime: `${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}`,
          endTime: `${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}`,
        });
      }

      currentMinutes += matchDuration;
    }
  });

  return slots;
}

/** Grilla compartida de turnos playoff (misma lógica que close-groups). */
export function buildPlayoffScheduleSlots(
  scheduleConfig: ScheduleConfig | undefined,
  playoffSlotIntervalMinutes: number
): PlayoffScheduleSlot[] | null {
  if (!scheduleConfig) return null;

  const usePhysicalSelections =
    (scheduleConfig.selectedPhysicalSlots?.length ?? 0) > 0 &&
    scheduleConfig.courtIds.length > 0;

  const useLegacyDaysGrid =
    scheduleConfig.days.length > 0 &&
    scheduleConfig.courtIds.length > 0 &&
    !(scheduleConfig.selectedPhysicalSlots?.length);

  if (usePhysicalSelections && scheduleConfig.selectedPhysicalSlots?.length) {
    return expandPhysicalWindowsToPlayoffSlotList(
      scheduleConfig.selectedPhysicalSlots,
      playoffSlotIntervalMinutes
    );
  }

  if (useLegacyDaysGrid) {
    const raw = generateTimeSlots(
      scheduleConfig.days,
      playoffSlotIntervalMinutes,
      scheduleConfig.courtIds.length
    );
    return raw.map((s, idx) => ({
      date: s.date,
      startTime: s.startTime,
      court_id: scheduleConfig.courtIds[idx % scheduleConfig.courtIds.length]!,
    }));
  }

  return null;
}

export function playoffSlotIntervalFromMinutes(
  playoffMinutesFromDb: number
): number {
  return slotIntervalMinutesForPlayoffScheduling(
    Math.max(15, playoffMinutesFromDb)
  );
}
