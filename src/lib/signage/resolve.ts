import { addDaysIso, weekdayOf } from "@/lib/class-time";
import { todayInTimeZone } from "@/lib/clubs/schedule";

export type SignageSchedule = {
  id: number;
  playlistId: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
  startsOn: string | null;
  endsOn: string | null;
  priority: number;
  isActive: boolean;
};

export type SignageOverride = {
  playlistId: number;
  endsAt: string | null;
};

export type PlaybackSource = "override" | "schedule" | "default" | "fallback";

export type PlaybackChoice = {
  source: PlaybackSource;
  playlistId: number | null;
  scheduleId: number | null;
};

function clockMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function inDates(date: string, startsOn: string | null, endsOn: string | null): boolean {
  if (startsOn && date < startsOn) return false;
  if (endsOn && date > endsOn) return false;
  return true;
}

export function localSignageClock(now: Date, timeZone: string): { date: string; minutes: number; weekday: number } {
  const date = todayInTimeZone(now, timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { date, minutes: hour * 60 + minute, weekday: weekdayOf(date) };
}

export function scheduleMatches(schedule: SignageSchedule, date: string, minutes: number): boolean {
  if (!schedule.isActive || schedule.weekdays.length === 0) return false;
  const start = clockMinutes(schedule.startTime);
  const end = clockMinutes(schedule.endTime);
  const weekday = weekdayOf(date);
  if (start === end) return schedule.weekdays.includes(weekday) && inDates(date, schedule.startsOn, schedule.endsOn);
  if (start < end) {
    return schedule.weekdays.includes(weekday) && inDates(date, schedule.startsOn, schedule.endsOn) && minutes >= start && minutes < end;
  }
  if (minutes >= start && schedule.weekdays.includes(weekday) && inDates(date, schedule.startsOn, schedule.endsOn)) {
    return true;
  }
  const yesterday = addDaysIso(date, -1);
  return minutes < end && schedule.weekdays.includes(weekdayOf(yesterday)) && inDates(yesterday, schedule.startsOn, schedule.endsOn);
}

function dateRangesOverlap(a: SignageSchedule, b: SignageSchedule): boolean {
  const start = a.startsOn && b.startsOn ? (a.startsOn > b.startsOn ? a.startsOn : b.startsOn) : a.startsOn ?? b.startsOn;
  const end = a.endsOn && b.endsOn ? (a.endsOn < b.endsOn ? a.endsOn : b.endsOn) : a.endsOn ?? b.endsOn;
  if (start && end && start > end) return false;
  return true;
}

function weekIntervals(schedule: SignageSchedule): Array<[number, number]> {
  const start = clockMinutes(schedule.startTime);
  const end = clockMinutes(schedule.endTime);
  const intervals: Array<[number, number]> = [];
  for (const day of schedule.weekdays) {
    const base = day * 1440;
    if (start === end) intervals.push([base, base + 1440]);
    else if (start < end) intervals.push([base + start, base + end]);
    else {
      intervals.push([base + start, base + 1440]);
      intervals.push([((day + 1) % 7) * 1440, ((day + 1) % 7) * 1440 + end]);
    }
  }
  return intervals;
}

function intervalsOverlap(left: Array<[number, number]>, right: Array<[number, number]>): boolean {
  return left.some(([a0, a1]) => right.some(([b0, b1]) => a0 < b1 && b0 < a1));
}

/** Dos programaciones activas de la misma pantalla que pueden coincidir. */
export function schedulesConflict(a: SignageSchedule, b: SignageSchedule): boolean {
  if (a.id === b.id || !a.isActive || !b.isActive) return false;
  if (!dateRangesOverlap(a, b)) return false;
  return intervalsOverlap(weekIntervals(a), weekIntervals(b));
}

export function resolvePlayback(input: {
  now: Date;
  timeZone: string;
  schedules: SignageSchedule[];
  defaultPlaylistId: number | null;
  override: SignageOverride | null;
  activePlaylistIds: ReadonlySet<number>;
}): PlaybackChoice {
  const override = input.override;
  if (override && input.activePlaylistIds.has(override.playlistId)) {
    const open = override.endsAt == null || new Date(override.endsAt).getTime() > input.now.getTime();
    if (open) return { source: "override", playlistId: override.playlistId, scheduleId: null };
  }

  const clock = localSignageClock(input.now, input.timeZone);
  const matches = input.schedules
    .filter((schedule) => input.activePlaylistIds.has(schedule.playlistId) && scheduleMatches(schedule, clock.date, clock.minutes))
    .sort((a, b) => b.priority - a.priority || a.id - b.id);
  const winner = matches[0];
  if (winner) return { source: "schedule", playlistId: winner.playlistId, scheduleId: winner.id };

  if (input.defaultPlaylistId != null && input.activePlaylistIds.has(input.defaultPlaylistId)) {
    return { source: "default", playlistId: input.defaultPlaylistId, scheduleId: null };
  }
  return { source: "fallback", playlistId: null, scheduleId: null };
}

export function promotionIsLive(
  promo: { isActive: boolean; startsOn: string | null; endsOn: string | null },
  today: string
): boolean {
  if (!promo.isActive) return false;
  if (promo.startsOn && promo.startsOn > today) return false;
  if (promo.endsOn && promo.endsOn < today) return false;
  return true;
}
