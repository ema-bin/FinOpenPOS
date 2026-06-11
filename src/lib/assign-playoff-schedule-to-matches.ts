import { playoffMatchDurationMinutes } from "@/lib/playoff-match-duration";
import type { PlayoffBracketMatch } from "@/lib/playoff-matches-plan";
import type { PlayoffScheduleSlot } from "@/lib/playoff-schedule-slots";
import type {
  PlannedPlayoffMatchPreview,
  PlannedTournamentPreview,
} from "@/lib/plan-bulk-playoffs-preview";

export type PlayoffMatchWithSchedule = PlayoffBracketMatch & {
  match_date: string | null;
  start_time: string | null;
  end_time: string | null;
  court_id: number | null;
};

function matchNeedsSchedule(match: PlayoffBracketMatch): boolean {
  return Boolean(
    (match.team1_id && match.team2_id) ||
      match.source_team1 ||
      match.source_team2
  );
}

function calculateEndTimeFromStart(
  startTime: string,
  playoffMin: number
): string {
  const dur = playoffMatchDurationMinutes(playoffMin);
  const [startH, startM] = startTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = startMinutes + dur;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

export type TournamentPlayoffPlan = {
  tournamentId: number;
  matches: PlayoffBracketMatch[];
  playoffMin: number;
};

const ROUND_ORDER: Record<string, number> = {
  "16avos": 1,
  octavos: 2,
  cuartos: 3,
  semifinal: 4,
  final: 5,
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

function compareMatchesByRound(
  a: Pick<PlayoffBracketMatch, "round" | "bracket_pos">,
  b: Pick<PlayoffBracketMatch, "round" | "bracket_pos">
): number {
  const aOrder = ROUND_ORDER[a.round] ?? 999;
  const bOrder = ROUND_ORDER[b.round] ?? 999;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.bracket_pos - b.bracket_pos;
}

/**
 * Reparte slots cronológicos entre torneos priorizando ronda (16avos → octavos → cuartos → semis → final).
 * Todos los octavos de todos los torneos ocupan los primeros huecos, luego cuartos, etc.
 */
export function assignPlayoffScheduleSlotsAcrossTournamentsByRound(
  plans: TournamentPlayoffPlan[],
  sharedSlots: PlayoffScheduleSlot[]
): Map<number, PlayoffMatchWithSchedule[]> {
  const slots = sortSlotsChronologically(sharedSlots);
  const result = new Map<number, PlayoffMatchWithSchedule[]>();

  type QueueItem = {
    tournamentId: number;
    originalIndex: number;
    match: PlayoffMatchWithSchedule;
    playoffMin: number;
  };
  const queue: QueueItem[] = [];

  for (const plan of plans) {
    const withSchedule: PlayoffMatchWithSchedule[] = plan.matches.map((m) => ({
      ...m,
      match_date: null,
      start_time: null,
      end_time: null,
      court_id: null,
    }));
    result.set(plan.tournamentId, withSchedule);

    withSchedule.forEach((m, originalIndex) => {
      if (!matchNeedsSchedule(m)) return;
      queue.push({
        tournamentId: plan.tournamentId,
        originalIndex,
        match: m,
        playoffMin: plan.playoffMin,
      });
    });
  }

  queue.sort((a, b) => {
    const byRound = compareMatchesByRound(a.match, b.match);
    if (byRound !== 0) return byRound;
    return a.tournamentId - b.tournamentId;
  });

  if (slots.length < queue.length) {
    throw new Error(
      `No hay suficientes slots disponibles. Se necesitan ${queue.length} slots pero solo hay ${slots.length} disponibles.`
    );
  }

  queue.forEach((item, slotIndex) => {
    const slot = slots[slotIndex];
    const tournamentMatches = result.get(item.tournamentId)!;
    const match = tournamentMatches[item.originalIndex];
    match.match_date = slot.date;
    match.start_time = slot.startTime;
    match.end_time =
      slot.endTime?.trim() ||
      calculateEndTimeFromStart(slot.startTime, item.playoffMin);
    match.court_id = slot.court_id;
  });

  return result;
}

/** Asigna slots a partidos de playoff en orden de ronda (misma lógica que close-groups). */
export function assignPlayoffScheduleSlots(
  matches: PlayoffBracketMatch[],
  scheduleSlots: PlayoffScheduleSlot[],
  playoffMin: number
): PlayoffMatchWithSchedule[] {
  const allMatchesWithSchedule: PlayoffMatchWithSchedule[] = matches.map((m) => ({
    ...m,
    match_date: null,
    start_time: null,
    end_time: null,
    court_id: null,
  }));

  if (scheduleSlots.length === 0) {
    return allMatchesWithSchedule;
  }

  const matchesNeedingSchedule = allMatchesWithSchedule.filter(matchNeedsSchedule);

  if (scheduleSlots.length < matchesNeedingSchedule.length) {
    throw new Error(
      `No hay suficientes slots disponibles. Se necesitan ${matchesNeedingSchedule.length} slots pero solo hay ${scheduleSlots.length} disponibles.`
    );
  }

  const matchIndices = allMatchesWithSchedule.map((_, index) => index);
  matchIndices.sort((a, b) =>
    compareMatchesByRound(
      allMatchesWithSchedule[a],
      allMatchesWithSchedule[b]
    )
  );

  let slotIndex = 0;
  matchIndices.forEach((originalIndex) => {
    const match = allMatchesWithSchedule[originalIndex];
    if (!matchNeedsSchedule(match)) return;
    if (slotIndex >= scheduleSlots.length) return;

    const slot = scheduleSlots[slotIndex];
    match.match_date = slot.date;
    match.start_time = slot.startTime;
    match.end_time =
      slot.endTime?.trim() ||
      calculateEndTimeFromStart(slot.startTime, playoffMin);
    match.court_id = slot.court_id;
    slotIndex++;
  });

  return allMatchesWithSchedule;
}

export function buildExplicitSlotsFromScheduledMatches(
  matches: PlayoffMatchWithSchedule[]
): PlayoffScheduleSlot[] {
  return [...matches]
    .filter(matchNeedsSchedule)
    .sort(compareMatchesByRound)
    .map((m) => ({
      date: (m.match_date ?? "").split("T")[0],
      startTime: m.start_time ?? "",
      court_id: m.court_id ?? 0,
      ...(m.end_time ? { endTime: m.end_time } : {}),
    }));
}

function plannedMatchNeedsSchedule(match: PlannedPlayoffMatchPreview): boolean {
  return Boolean(match.match_date && match.start_time);
}

function sortPlannedMatches(
  matches: PlannedPlayoffMatchPreview[]
): PlannedPlayoffMatchPreview[] {
  return [...matches].sort((a, b) => {
    const aOrder = ROUND_ORDER[a.round] ?? 999;
    const bOrder = ROUND_ORDER[b.round] ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.bracket_pos - b.bracket_pos;
  });
}

export function getPlannedMatchesNeedingSchedule(
  tournament: PlannedTournamentPreview
): PlannedPlayoffMatchPreview[] {
  return sortPlannedMatches(
    tournament.matches.filter(plannedMatchNeedsSchedule)
  );
}

export function buildExplicitSlotsFromPlannedTournament(
  tournament: PlannedTournamentPreview
): PlayoffScheduleSlot[] {
  return getPlannedMatchesNeedingSchedule(tournament).map((m) => ({
    date: (m.match_date ?? "").split("T")[0],
    startTime: m.start_time ?? "",
    court_id: m.court_id ?? 0,
    ...(m.end_time ? { endTime: m.end_time } : {}),
  }));
}

export function validatePlannedTournamentSchedule(
  tournament: PlannedTournamentPreview
): string | null {
  const needing = getPlannedMatchesNeedingSchedule(tournament);
  for (const m of needing) {
    if (!m.match_date?.trim() || !m.start_time?.trim() || !m.court_id) {
      const roundLabel = m.round.charAt(0).toUpperCase() + m.round.slice(1);
      return `Falta fecha, hora o cancha en ${roundLabel} (pos. ${m.bracket_pos}) de "${tournament.name}".`;
    }
  }
  return null;
}
