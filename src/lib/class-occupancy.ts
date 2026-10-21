import { rangesOverlap } from "./class-time";

export type OccupancySession = {
  courtId: number;
  startTime: string;
  endTime: string;
  status: string;
  label: string;
};

export type ClassBlock = { label: string };

export function classBlockForSlot(
  slot: { court_id: number; start_time: string; end_time: string },
  sessions: OccupancySession[]
): ClassBlock | null {
  const labels: string[] = [];
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
  }
  if (labels.length === 0) return null;
  return { label: labels.join(" · ") };
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
