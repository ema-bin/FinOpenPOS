import type { GroupMatchPayload } from "@/lib/tournament-scheduler";

export type SameDayGroup = {
  size: 3 | 4;
  matches: GroupMatchPayload[];
  teams: number[];
};

type SlotLike = {
  date: string;
  datetime: Date;
};

/** Máximo gap entre inicios de partidos del mismo equipo (como múltiplo de duración). */
const MAX_START_GAP_MATCH_DURATIONS = 3;

export function buildTeamsNeedSameDayCloseSet(
  rows: Array<{ id: number; needs_same_day_close_matches?: boolean | null }>
): Set<number> {
  return new Set(rows.filter((row) => row.needs_same_day_close_matches).map((row) => row.id));
}

function normalizeDate(date: string): string {
  return String(date).trim().slice(0, 10);
}

function slotsAreSameDayClose(a: SlotLike, b: SlotLike, matchDurationMs: number): boolean {
  if (normalizeDate(a.date) !== normalizeDate(b.date)) return false;
  const maxGapMs = matchDurationMs * MAX_START_GAP_MATCH_DURATIONS;
  const gap = Math.abs(a.datetime.getTime() - b.datetime.getTime());
  return gap <= maxGapMs;
}

function firstRoundMatchIndex(group: SameDayGroup, teamId: number): number | null {
  for (let i = 0; i < Math.min(2, group.matches.length); i++) {
    const match = group.matches[i];
    if (match.team1_id === teamId || match.team2_id === teamId) return i;
  }
  return null;
}

function matchIndicesForTeam(group: SameDayGroup, teamId: number): number[] {
  return group.matches
    .map((match, index) =>
      match.team1_id === teamId || match.team2_id === teamId ? index : -1
    )
    .filter((index) => index >= 0);
}

function teamSameDayCloseValid(
  slotsInMatchOrder: SlotLike[],
  group: SameDayGroup,
  teamId: number,
  matchDurationMs: number
): boolean {
  if (group.size === 4) {
    const firstIdx = firstRoundMatchIndex(group, teamId);
    if (firstIdx == null) return true;
    const firstSlot = slotsInMatchOrder[firstIdx];
    for (const secondIdx of [2, 3]) {
      const secondSlot = slotsInMatchOrder[secondIdx];
      if (!secondSlot) return false;
      if (!slotsAreSameDayClose(firstSlot, secondSlot, matchDurationMs)) return false;
    }
    return true;
  }

  const indices = matchIndicesForTeam(group, teamId);
  if (indices.length <= 1) return true;

  const teamSlots = indices.map((index) => slotsInMatchOrder[index]).filter(Boolean);
  const dates = new Set(teamSlots.map((slot) => normalizeDate(slot.date)));
  if (dates.size !== 1) return false;

  const sorted = [...teamSlots].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!slotsAreSameDayClose(sorted[i], sorted[i + 1], matchDurationMs)) return false;
  }
  return true;
}

export function assignmentSatisfiesSameDayCloseTeams(
  slotsInMatchOrder: SlotLike[],
  group: SameDayGroup,
  teamsNeedSameDayClose: Set<number>,
  matchDurationMs: number
): boolean {
  if (teamsNeedSameDayClose.size === 0) return true;

  for (const teamId of group.teams) {
    if (!teamsNeedSameDayClose.has(teamId)) continue;
    if (!teamSameDayCloseValid(slotsInMatchOrder, group, teamId, matchDurationMs)) {
      return false;
    }
  }
  return true;
}
