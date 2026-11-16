import { CourtSlotsRepository } from "@/repositories/court-slots.repository";
import { CourtReservationsRepository } from "@/repositories/court-reservations.repository";
import { weekDatesFromMonday } from "@/lib/court-reservation-rules";

export async function generateReservationWeek(input: {
  slots: CourtSlotsRepository;
  reservations: CourtReservationsRepository;
  courtIds: number[];
  monday: string;
  clubId?: number;
  slotConfig: {
    startHour: string;
    endHour: string;
    durationMinutes: number;
    overnight?: boolean;
  };
}) {
  const dates = weekDatesFromMonday(input.monday);
  const runId = await input.reservations.startRun(dates[0], dates[6], input.clubId);
  try {
    const days = [];
    for (const date of dates) {
      await input.slots.generateSlotsForDate(date, input.slotConfig, input.courtIds, input.clubId);
      const applied = await input.reservations.applyDate(date, input.clubId);
      days.push({ date, ...applied });
    }
    await input.reservations.finishRun(runId, "ok", { days }, null);
    return { weekStart: dates[0], weekEnd: dates[6], days };
  } catch (error) {
    await input.reservations.finishRun(
      runId,
      "error",
      null,
      error instanceof Error ? error.message : "Error"
    );
    throw error;
  }
}
