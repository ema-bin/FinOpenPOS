/**
 * Optimiza la asignación de equipos a zonas intercambiando parejas (sin mover cabezas de zona)
 * para maximizar la compatibilidad horaria antes de generar horarios.
 */

export type OptimizeGroupMatch = {
  tournament_group_id: number;
  team1_id: number | null;
  team2_id: number | null;
  match_order?: number | null;
};

export type OptimizeGroupTeam = {
  teamId: number;
  groupId: number;
  restrictedSlotIds: number[];
  isFixedHead: boolean;
};

export type TeamSwapPlan = {
  team1Id: number;
  group1Id: number;
  team2Id: number;
  group2Id: number;
};

export type AssignmentScore = {
  infeasibleMatches: number;
  minMatchViableSlots: number;
  totalViableSlots: number;
  worstPairCompatibilityPct: number;
};

export type OptimizeGroupAssignmentsResult = {
  swaps: TeamSwapPlan[];
  scoreBefore: AssignmentScore;
  scoreAfter: AssignmentScore;
  improved: boolean;
};

type GroupMeta = {
  groupId: number;
  size: number;
  teamIds: number[];
};

type InternalState = {
  matches: OptimizeGroupMatch[];
  groups: Map<number, GroupMeta>;
  availability: Map<number, Set<number>>;
  allSlotIds: number[];
};

function buildAvailableSlots(
  restrictedSlotIds: number[],
  allSlotIds: number[]
): Set<number> {
  const restricted = new Set(restrictedSlotIds);
  const available = new Set<number>();
  for (const slotId of allSlotIds) {
    if (!restricted.has(slotId)) available.add(slotId);
  }
  return available;
}

function countViableSlots(
  teamIds: number[],
  availability: Map<number, Set<number>>,
  allSlotIds: number[]
): number {
  if (teamIds.length === 0) return 0;
  let count = 0;
  for (const slotId of allSlotIds) {
    if (teamIds.every((tid) => availability.get(tid)?.has(slotId))) count++;
  }
  return count;
}

function pairwiseCompatibilityPct(
  a: Set<number>,
  b: Set<number>
): number {
  let overlap = 0;
  a.forEach((slotId) => {
    if (b.has(slotId)) overlap++;
  });
  const base = Math.min(a.size, b.size);
  return base > 0 ? Math.round((overlap / base) * 100) : 0;
}

function teamsRequiredForMatch(
  group: GroupMeta,
  match: OptimizeGroupMatch
): number[] {
  if (
    group.size === 4 &&
    (match.match_order === 3 ||
      match.match_order === 4 ||
      (match.team1_id == null && match.team2_id == null))
  ) {
    return [...group.teamIds];
  }
  const out: number[] = [];
  if (match.team1_id != null) out.push(match.team1_id);
  if (match.team2_id != null) out.push(match.team2_id);
  return out;
}

export function scoreGroupAssignments(state: InternalState): AssignmentScore {
  let infeasibleMatches = 0;
  let totalViableSlots = 0;
  let minMatchViableSlots = Number.POSITIVE_INFINITY;
  let worstPairCompatibilityPct = 100;

  for (const group of Array.from(state.groups.values())) {
    const groupMatches = state.matches.filter(
      (m) => m.tournament_group_id === group.groupId
    );

    for (const match of groupMatches) {
      const required = teamsRequiredForMatch(group, match);
      const viable = countViableSlots(required, state.availability, state.allSlotIds);
      totalViableSlots += viable;
      if (viable === 0) infeasibleMatches += 1;
      minMatchViableSlots = Math.min(minMatchViableSlots, viable);
    }

    const availList = group.teamIds
      .map((tid: number) => state.availability.get(tid))
      .filter((x: Set<number> | undefined): x is Set<number> => Boolean(x));

    for (let i = 0; i < availList.length; i++) {
      for (let j = i + 1; j < availList.length; j++) {
        worstPairCompatibilityPct = Math.min(
          worstPairCompatibilityPct,
          pairwiseCompatibilityPct(availList[i], availList[j])
        );
      }
    }
  }

  if (minMatchViableSlots === Number.POSITIVE_INFINITY) {
    minMatchViableSlots = 0;
  }
  if (worstPairCompatibilityPct === 100 && state.groups.size === 0) {
    worstPairCompatibilityPct = 0;
  }

  return {
    infeasibleMatches,
    minMatchViableSlots,
    totalViableSlots,
    worstPairCompatibilityPct,
  };
}

export function compareAssignmentScores(
  a: AssignmentScore,
  b: AssignmentScore
): number {
  if (a.infeasibleMatches !== b.infeasibleMatches) {
    return b.infeasibleMatches - a.infeasibleMatches;
  }
  if (a.minMatchViableSlots !== b.minMatchViableSlots) {
    return a.minMatchViableSlots - b.minMatchViableSlots;
  }
  if (a.totalViableSlots !== b.totalViableSlots) {
    return a.totalViableSlots - b.totalViableSlots;
  }
  return a.worstPairCompatibilityPct - b.worstPairCompatibilityPct;
}

function cloneState(state: InternalState): InternalState {
  return {
    matches: state.matches.map((m) => ({ ...m })),
    groups: new Map(
      Array.from(state.groups.entries()).map(([id, g]) => [
        id,
        { ...g, teamIds: [...g.teamIds] },
      ])
    ),
    availability: state.availability,
    allSlotIds: state.allSlotIds,
  };
}

function applySwap(state: InternalState, swap: TeamSwapPlan): void {
  const { team1Id, group1Id, team2Id, group2Id } = swap;

  for (const match of state.matches) {
    if (match.team1_id === team1Id) match.team1_id = team2Id;
    else if (match.team1_id === team2Id) match.team1_id = team1Id;

    if (match.team2_id === team1Id) match.team2_id = team2Id;
    else if (match.team2_id === team2Id) match.team2_id = team1Id;
  }

  if (group1Id !== group2Id) {
    const g1 = state.groups.get(group1Id);
    const g2 = state.groups.get(group2Id);
    if (g1 && g2) {
      g1.teamIds = g1.teamIds.map((id) =>
        id === team1Id ? team2Id : id === team2Id ? team1Id : id
      );
      g2.teamIds = g2.teamIds.map((id) =>
        id === team1Id ? team2Id : id === team2Id ? team1Id : id
      );
    }
  }
}

function buildInternalState(input: {
  groups: Array<{ id: number }>;
  groupTeams: OptimizeGroupTeam[];
  matches: OptimizeGroupMatch[];
  allSlotIds: number[];
}): InternalState {
  const availability = new Map<number, Set<number>>();
  for (const gt of input.groupTeams) {
    availability.set(
      gt.teamId,
      buildAvailableSlots(gt.restrictedSlotIds, input.allSlotIds)
    );
  }

  const groups = new Map<number, GroupMeta>();
  for (const group of input.groups) {
    const teamsInGroup = input.groupTeams
      .filter((gt) => gt.groupId === group.id)
      .sort((a, b) => {
        const headA = a.isFixedHead ? 0 : 1;
        const headB = b.isFixedHead ? 0 : 1;
        if (headA !== headB) return headA - headB;
        return a.teamId - b.teamId;
      })
      .map((gt) => gt.teamId);

    groups.set(group.id, {
      groupId: group.id,
      size: teamsInGroup.length,
      teamIds: teamsInGroup,
    });
  }

  return {
    matches: input.matches.map((m) => ({ ...m })),
    groups,
    availability,
    allSlotIds: input.allSlotIds,
  };
}

function listSwapCandidates(
  groups: Map<number, GroupMeta>,
  fixedHeadTeamIds: Set<number>
): TeamSwapPlan[] {
  const swappable: Array<{ teamId: number; groupId: number }> = [];
  for (const group of Array.from(groups.values())) {
    for (const teamId of group.teamIds) {
      if (!fixedHeadTeamIds.has(teamId)) {
        swappable.push({ teamId, groupId: group.groupId });
      }
    }
  }

  const candidates: TeamSwapPlan[] = [];

  for (let i = 0; i < swappable.length; i++) {
    for (let j = i + 1; j < swappable.length; j++) {
      const a = swappable[i];
      const b = swappable[j];
      const gA = groups.get(a.groupId);
      const gB = groups.get(b.groupId);
      if (!gA || !gB) continue;

      if (a.groupId !== b.groupId && gA.size !== gB.size) continue;

      // En zonas de 3, intercambiar dentro de la misma zona no cambia los cruces.
      if (a.groupId === b.groupId && gA.size === 3) continue;

      candidates.push({
        team1Id: a.teamId,
        group1Id: a.groupId,
        team2Id: b.teamId,
        group2Id: b.groupId,
      });
    }
  }

  return candidates;
}

const MAX_GREEDY_ITERATIONS = 80;

export function optimizeGroupTeamAssignments(input: {
  groups: Array<{ id: number }>;
  groupTeams: OptimizeGroupTeam[];
  matches: OptimizeGroupMatch[];
  allSlotIds: number[];
}): OptimizeGroupAssignmentsResult {
  const state = buildInternalState(input);
  const scoreBefore = scoreGroupAssignments(state);
  const swaps: TeamSwapPlan[] = [];
  const fixedHeadTeamIds = new Set(
    input.groupTeams.filter((gt) => gt.isFixedHead).map((gt) => gt.teamId)
  );

  if (input.allSlotIds.length === 0) {
    return { swaps, scoreBefore, scoreAfter: scoreBefore, improved: false };
  }

  for (let iter = 0; iter < MAX_GREEDY_ITERATIONS; iter++) {
    const currentScore = scoreGroupAssignments(state);
    const candidates = listSwapCandidates(state.groups, fixedHeadTeamIds);

    let bestSwap: TeamSwapPlan | null = null;
    let bestScore = currentScore;
    let bestDelta = 0;

    for (const swap of candidates) {
      const trial = cloneState(state);
      applySwap(trial, swap);
      const trialScore = scoreGroupAssignments(trial);
      const delta = compareAssignmentScores(trialScore, currentScore);
      if (delta > 0 && delta > bestDelta) {
        bestDelta = delta;
        bestSwap = swap;
        bestScore = trialScore;
      }
    }

    if (!bestSwap) break;

    applySwap(state, bestSwap);
    swaps.push(bestSwap);

    if (bestScore.infeasibleMatches === 0 && bestScore.worstPairCompatibilityPct >= 70) {
      break;
    }
  }

  const scoreAfter = scoreGroupAssignments(state);
  return {
    swaps,
    scoreBefore,
    scoreAfter,
    improved: compareAssignmentScores(scoreAfter, scoreBefore) > 0,
  };
}
