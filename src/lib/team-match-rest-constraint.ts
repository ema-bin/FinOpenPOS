import type { GroupMatchPayload } from "@/lib/tournament-scheduler";

export type TeamRestGroup = {
  size: 3 | 4;
  matches: GroupMatchPayload[];
  teams: number[];
};

type SlotLike = {
  datetime: Date;
};

function matchIndicesForTeam(group: TeamRestGroup, teamId: number): number[] {
  return group.matches
    .map((match, index) =>
      match.team1_id === teamId || match.team2_id === teamId ? index : -1
    )
    .filter((index) => index >= 0);
}

function firstRoundMatchIndex(group: TeamRestGroup, teamId: number): number | null {
  for (let i = 0; i < Math.min(2, group.matches.length); i++) {
    const match = group.matches[i];
    if (match.team1_id === teamId || match.team2_id === teamId) return i;
  }
  return null;
}

/** Descanso mínimo: el siguiente partido empieza al menos una duración después del fin del anterior. */
export function slotsSatisfyTeamRest(
  a: SlotLike,
  b: SlotLike,
  matchDurationMs: number
): boolean {
  const [earlier, later] =
    a.datetime.getTime() <= b.datetime.getTime() ? [a, b] : [b, a];
  const earlierEnd = earlier.datetime.getTime() + matchDurationMs;
  const laterStart = later.datetime.getTime();
  return laterStart >= earlierEnd + matchDurationMs;
}

function teamRestValidGroupOf4(
  slotsInMatchOrder: SlotLike[],
  group: TeamRestGroup,
  teamId: number,
  matchDurationMs: number
): boolean {
  const firstIdx = firstRoundMatchIndex(group, teamId);
  if (firstIdx == null) return true;
  const firstSlot = slotsInMatchOrder[firstIdx];
  if (!firstSlot) return false;
  for (const secondIdx of [2, 3]) {
    const secondSlot = slotsInMatchOrder[secondIdx];
    if (!secondSlot) return false;
    if (!slotsSatisfyTeamRest(firstSlot, secondSlot, matchDurationMs)) return false;
  }
  return true;
}

function teamRestValidGroupOf3(
  slotsInMatchOrder: SlotLike[],
  group: TeamRestGroup,
  teamId: number,
  matchDurationMs: number
): boolean {
  const indices = matchIndicesForTeam(group, teamId);
  if (indices.length <= 1) return true;

  const teamSlots = indices
    .map((index) => slotsInMatchOrder[index])
    .filter((slot): slot is SlotLike => Boolean(slot));
  if (teamSlots.length !== indices.length) return false;

  const sorted = [...teamSlots].sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!slotsSatisfyTeamRest(sorted[i], sorted[i + 1], matchDurationMs)) return false;
  }
  return true;
}

/** Ningún equipo puede jugar dos partidos seguidos (sin descanso de al menos una duración). */
export function assignmentSatisfiesTeamRest(
  slotsInMatchOrder: SlotLike[],
  group: TeamRestGroup,
  matchDurationMs: number
): boolean {
  for (const teamId of group.teams) {
    const valid =
      group.size === 4
        ? teamRestValidGroupOf4(slotsInMatchOrder, group, teamId, matchDurationMs)
        : teamRestValidGroupOf3(slotsInMatchOrder, group, teamId, matchDurationMs);
    if (!valid) return false;
  }
  return true;
}
