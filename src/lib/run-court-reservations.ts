import type { SupabaseClient } from "@supabase/supabase-js";
import { isCourtReservationsEnabledServer } from "@/lib/court-reservations-flag";
import { nextMonday } from "@/lib/court-reservation-rules";
import { zonedParts } from "@/lib/clubs/schedule";
import { courtSlotConfig, loadClubSchedule } from "@/lib/clubs/load-club";
import { generateReservationWeek } from "@/lib/generate-reservation-week";
import { getDailySalesClosureCronActorUid } from "@/lib/run-daily-sales-closure";
import { CourtSlotsRepository } from "@/repositories/court-slots.repository";
import { CourtReservationsRepository } from "@/repositories/court-reservations.repository";

/** Los sábados a las 06:00, dentro de la tarea diaria. Otro día u otra hora no escribe nada. */
export async function runCourtReservations(supabase: SupabaseClient, now = new Date()) {
  if (!isCourtReservationsEnabledServer()) return { skipped: true as const, clubs: [] };

  const actor = getDailySalesClosureCronActorUid();
  const { data: clubs, error } = await supabase.from("clubs").select("id").eq("is_active", true).order("id");
  if (error) throw new Error(error.message);

  const results = [];
  for (const row of clubs ?? []) {
    const club = await loadClubSchedule(supabase, row.id);
    const local = zonedParts(now, club.timezone);
    if (!club.moduleReservations || !club.autoReservationWeek) {
      results.push({ clubId: club.id, skipped: "module" });
      continue;
    }
    if (local.weekday !== 6 || local.weekday !== club.reservationWeekWeekday || local.hour !== club.reservationWeekHour) {
      results.push({ clubId: club.id, skipped: "hour" });
      continue;
    }
    const { data: courts, error: courtsError } = await supabase
      .from("courts")
      .select("id")
      .eq("club_id", club.id)
      .eq("is_active", true);
    if (courtsError) throw new Error(courtsError.message);
    const result = await generateReservationWeek({
      slots: new CourtSlotsRepository(supabase, actor),
      reservations: new CourtReservationsRepository(supabase, actor),
      courtIds: (courts ?? []).map((court) => court.id),
      monday: nextMonday(local.date),
      clubId: club.id,
      slotConfig: courtSlotConfig(club),
    });
    results.push({ clubId: club.id, ...result });
  }
  return { skipped: false as const, clubs: results };
}
