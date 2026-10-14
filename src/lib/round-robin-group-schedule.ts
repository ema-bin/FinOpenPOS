import type { GroupMatchPayload } from "@/lib/tournament-scheduler";
import { assignmentSatisfiesSameDayCloseTeams } from "@/lib/team-same-day-match-constraint";
import {
  assignmentSatisfiesTeamRest,
  slotsSatisfyTeamRest,
} from "@/lib/team-match-rest-constraint";

/** Tope de nodos: C(n, 6) × 720 no se puede recorrer como una zona de 4. */
const MAX_NODES = 40000;
const MAX_SAME_DAY_GAP_DURATIONS = 3;

export type RoundRobinSlot = {
  slotId: string;
  date: string;
  datetime: Date;
};

type RoundRobinMatch = {
  team1_id: number | null;
  team2_id: number | null;
};

/**
 * Zona todos contra todos: 6 partidos, 4 parejas, las dos ya definidas.
 * Una zona de 4 del formato estándar tiene 4 partidos, así que no entra acá.
 */
export function isRoundRobinZoneMatches(matches: RoundRobinMatch[]): boolean {
  if (matches.length !== 6) return false;
  const counts = new Map<number, number>();
  for (const match of matches) {
    if (match.team1_id == null || match.team2_id == null || match.team1_id === match.team2_id) {
      return false;
    }
    counts.set(match.team1_id, (counts.get(match.team1_id) ?? 0) + 1);
    counts.set(match.team2_id, (counts.get(match.team2_id) ?? 0) + 1);
  }
  if (counts.size !== 4) return false;
  for (const count of Array.from(counts.values())) {
    if (count !== 3) return false;
  }
  return true;
}

function dayKey(date: string): string {
  return date.trim().slice(0, 10);
}

/**
 * Busca hasta `maxCandidates` asignaciones (slots en el mismo orden que `matches`).
 * Respeta descanso entre los partidos de cada pareja y, si está marcado, mismo día y cercanos.
 */
export function searchRoundRobinSlotAssignments<T extends RoundRobinSlot>(input: {
  matches: RoundRobinMatch[];
  teams: number[];
  slots: T[];
  usedSlotIds: Set<string>;
  matchDurationMs: number;
  maxCandidates: number;
  blockedSlotIdsByMatch?: Map<number, Set<string>>;
  teamsNeedSameDayClose?: Set<number>;
  ignoreBlocks?: boolean;
}): T[][] {
  const { matches, teams, matchDurationMs, maxCandidates } = input;
  if (matches.length === 0 || maxCandidates <= 0) return [];

  const free = input.slots
    .filter((slot) => !input.usedSlotIds.has(slot.slotId))
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime() || a.slotId.localeCompare(b.slotId));

  const options: number[][] = matches.map((_, matchIdx) => {
    const blocked = input.ignoreBlocks ? undefined : input.blockedSlotIdsByMatch?.get(matchIdx);
    const indexes: number[] = [];
    for (let i = 0; i < free.length; i++) {
      if (blocked?.has(free[i].slotId)) continue;
      indexes.push(i);
    }
    return indexes;
  });
  if (options.some((indexes) => indexes.length === 0)) return [];

  const order = matches
    .map((_, index) => index)
    .sort((a, b) => options[a].length - options[b].length || a - b);

  const chosen: Array<T | undefined> = new Array(matches.length);
  const used = new Set<number>();
  const results: T[][] = [];
  let nodes = 0;

  const teamIdsOf = (matchIdx: number): number[] => {
    const match = matches[matchIdx];
    const ids: number[] = [];
    if (match.team1_id != null) ids.push(match.team1_id);
    if (match.team2_id != null) ids.push(match.team2_id);
    return ids;
  };

  const assignedSlotsForTeam = (teamId: number): T[] => {
    const slots: T[] = [];
    for (let i = 0; i < matches.length; i++) {
      const slot = chosen[i];
      if (!slot) continue;
      const match = matches[i];
      if (match.team1_id === teamId || match.team2_id === teamId) slots.push(slot);
    }
    return slots;
  };

  const placementOk = (matchIdx: number, slot: T): boolean => {
    for (const teamId of teamIdsOf(matchIdx)) {
      const existing = assignedSlotsForTeam(teamId);
      for (const previous of existing) {
        if (!slotsSatisfyTeamRest(previous, slot, matchDurationMs)) return false;
      }
      if (input.teamsNeedSameDayClose?.has(teamId) && existing.length > 0) {
        const together = [...existing, slot].sort(
          (a, b) => a.datetime.getTime() - b.datetime.getTime()
        );
        const day = dayKey(together[0].date);
        for (let i = 0; i < together.length; i++) {
          if (dayKey(together[i].date) !== day) return false;
          if (i === 0) continue;
          const gap = together[i].datetime.getTime() - together[i - 1].datetime.getTime();
          if (gap > matchDurationMs * MAX_SAME_DAY_GAP_DURATIONS) return false;
        }
      }
    }
    return true;
  };

  const hasOpenSlot = (matchIdx: number): boolean => {
    for (const slotIdx of options[matchIdx]) {
      if (used.has(slotIdx)) continue;
      if (placementOk(matchIdx, free[slotIdx])) return true;
    }
    return false;
  };

  const dfs = (pos: number): void => {
    if (results.length >= maxCandidates || nodes > MAX_NODES) return;
    nodes += 1;
    if (pos === order.length) {
      const ordered = chosen as T[];
      const group = {
        size: 3 as const,
        matches: matches as GroupMatchPayload[],
        teams,
      };
      if (!assignmentSatisfiesTeamRest(ordered, group, matchDurationMs)) return;
      if (
        input.teamsNeedSameDayClose?.size &&
        !assignmentSatisfiesSameDayCloseTeams(
          ordered,
          group,
          input.teamsNeedSameDayClose,
          matchDurationMs
        )
      ) {
        return;
      }
      results.push(ordered.slice());
      return;
    }

    const matchIdx = order[pos];
    for (const slotIdx of options[matchIdx]) {
      if (used.has(slotIdx)) continue;
      const slot = free[slotIdx];
      if (!placementOk(matchIdx, slot)) continue;
      used.add(slotIdx);
      chosen[matchIdx] = slot;
      let open = true;
      for (let next = pos + 1; next < order.length; next++) {
        if (!hasOpenSlot(order[next])) {
          open = false;
          break;
        }
      }
      if (open) dfs(pos + 1);
      chosen[matchIdx] = undefined;
      used.delete(slotIdx);
      if (results.length >= maxCandidates || nodes > MAX_NODES) return;
    }
  };

  dfs(0);
  return results;
}
