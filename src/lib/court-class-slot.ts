import { rangesOverlap } from "@/lib/class-time";
import { ClassRequestError } from "@/lib/class-request-error";
import type { ClassesRepository } from "@/repositories/classes.repository";
import type { CourtSlotsRepository } from "@/repositories/court-slots.repository";

type Repos = {
  courtSlots: CourtSlotsRepository;
  classes: ClassesRepository;
};

/** Cancela o restaura una sola clase que pisa ese turno. No toca las otras del día. */
export async function setClassOnSlot(
  repos: Repos,
  slotId: number,
  sessionId: number,
  action: "cancel" | "restore"
): Promise<void> {
  const slot = await repos.courtSlots.findById(slotId);
  if (!slot) throw new ClassRequestError("No se encontró el turno", 404);
  const date = String(slot.slot_date).slice(0, 10);
  const sessions = await repos.classes.listOccupancy(date, { includeCancelled: true });
  const session = sessions.find(
    (item) =>
      item.id === sessionId &&
      item.courtId === slot.court_id &&
      rangesOverlap(
        { start: slot.start_time, end: slot.end_time },
        { start: item.startTime, end: item.endTime }
      )
  );
  if (!session) throw new ClassRequestError("Esa clase no está en ese horario", 409);
  if (action === "cancel") {
    if (session.status !== "scheduled") throw new ClassRequestError("Esa clase ya está cancelada", 409);
    await repos.classes.updateSession(sessionId, { status: "cancelled" });
    return;
  }
  if (session.status !== "cancelled") throw new ClassRequestError("Esa clase no está cancelada", 409);
  await repos.classes.updateSession(sessionId, { status: "scheduled" });
}
