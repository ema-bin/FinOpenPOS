import { rangesOverlap } from "./class-time";

export type OccupancySession = {
  id?: number;
  courtId: number;
  startTime: string;
  endTime: string;
  status: string;
  label: string;
};

export type ClassBlock = { label: string; sessionIds: number[] };

export type SlotClassSession = {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "cancelled";
};

export function blocksForCourtSlot(
  slot: { court_id: number; start_time: string; end_time: string },
  classSessions: OccupancySession[],
  tournamentSessions: OccupancySession[]
): {
  class_block: ClassBlock | null;
  tournament_block: ClassBlock | null;
} {
  return {
    class_block: classBlockForSlot(slot, classSessions),
    tournament_block: classBlockForSlot(slot, tournamentSessions),
  };
}

export function classBlockForSlot(
  slot: { court_id: number; start_time: string; end_time: string },
  sessions: OccupancySession[]
): ClassBlock | null {
  const labels: string[] = [];
  const sessionIds: number[] = [];
  for (const session of sessions) {
    if (session.status !== "scheduled") continue;
    if (session.courtId !== slot.court_id) continue;
    if (
      !rangesOverlap(
        { start: slot.start_time, end: slot.end_time },
        { start: session.startTime, end: session.endTime }
      )
    ) {
      continue;
    }
    labels.push(session.label);
    if (session.id != null) sessionIds.push(session.id);
  }
  if (labels.length === 0) return null;
  return { label: labels.join(" · "), sessionIds };
}

/** Clases de esa cancha que pisan el turno, cada una con su horario. */
export function classesTouchingSlot(
  slot: { court_id: number; start_time: string; end_time: string },
  sessions: OccupancySession[]
): SlotClassSession[] {
  const rows: SlotClassSession[] = [];
  for (const session of sessions) {
    if (session.id == null) continue;
    if (session.status !== "scheduled" && session.status !== "cancelled") continue;
    if (session.courtId !== slot.court_id) continue;
    if (
      !rangesOverlap(
        { start: slot.start_time, end: slot.end_time },
        { start: session.startTime, end: session.endTime }
      )
    ) {
      continue;
    }
    rows.push({
      id: session.id,
      label: session.label,
      start_time: session.startTime.slice(0, 5),
      end_time: session.endTime.slice(0, 5),
      status: session.status,
    });
  }
  return rows;
}

export function isMissingRelation(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

export function isMissingClassesScope(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  const message = error?.message ?? "";
  return /invalid input value for enum/i.test(message) && /CLASSES/i.test(message);
}
