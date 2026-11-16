import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { clockOf } from "@/lib/clubs/settings";
import { DEFAULT_BUSINESS_CLOCK, type BusinessClock } from "@/lib/clubs/schedule";

export type ClubSchedule = {
  id: number;
  timezone: string;
  openTime: string;
  closeTime: string;
  durationMinutes: number;
  overnight: boolean;
  fixedWeekdays: number[];
  classPlayerLimit: number;
  registrationDiscountPercent: number;
  moduleReservations: boolean;
  moduleBuffet: boolean;
  autoDailyClosure: boolean;
  dailyClosureHour: number;
  autoReservationWeek: boolean;
  reservationWeekWeekday: number;
  reservationWeekHour: number;
};

const COLUMNS = `
  id, timezone, open_time, close_time, slot_duration_minutes, overnight_slot, fixed_weekdays,
  class_player_limit, registration_discount_percent,
  module_reservations, module_buffet, auto_daily_closure, daily_closure_hour,
  auto_reservation_week, reservation_week_weekday, reservation_week_hour
`;

function fromRow(row: Record<string, unknown>): ClubSchedule {
  const weekdays = Array.isArray(row.fixed_weekdays) ? row.fixed_weekdays.map(Number) : [1, 2, 3, 4, 5];
  return {
    id: Number(row.id),
    timezone: String(row.timezone || DEFAULT_BUSINESS_CLOCK.timeZone),
    openTime: clockOf(row.open_time) || "10:00",
    closeTime: clockOf(row.close_time) || "01:00",
    durationMinutes: Number(row.slot_duration_minutes) || 90,
    overnight: Boolean(row.overnight_slot),
    fixedWeekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
    classPlayerLimit: Number(row.class_player_limit) || 5,
    registrationDiscountPercent: Number(row.registration_discount_percent) || 0,
    moduleReservations: Boolean(row.module_reservations),
    moduleBuffet: Boolean(row.module_buffet),
    autoDailyClosure: Boolean(row.auto_daily_closure),
    dailyClosureHour: Number.isInteger(Number(row.daily_closure_hour)) ? Number(row.daily_closure_hour) : 3,
    autoReservationWeek: Boolean(row.auto_reservation_week),
    reservationWeekWeekday: Number.isInteger(Number(row.reservation_week_weekday))
      ? Number(row.reservation_week_weekday)
      : 6,
    reservationWeekHour: Number.isInteger(Number(row.reservation_week_hour)) ? Number(row.reservation_week_hour) : 3,
  };
}

export function businessClockOf(club: ClubSchedule): BusinessClock {
  return { timeZone: club.timezone, closureHour: club.dailyClosureHour };
}

export function courtSlotConfig(club: ClubSchedule) {
  return {
    startHour: club.openTime,
    endHour: club.closeTime,
    durationMinutes: club.durationMinutes,
    overnight: club.overnight,
  };
}

export async function loadClubSchedule(service: SupabaseClient, clubId: number): Promise<ClubSchedule> {
  const { data, error } = await service.from("clubs").select(COLUMNS).eq("id", clubId).maybeSingle();
  if (error) throw new ClubContextError(error.message, 500);
  if (!data) throw new ClubContextError("No se encontró el complejo", 404);
  return fromRow(data);
}

export async function businessClockForClient(
  supabase: SupabaseClient,
  clock?: BusinessClock
): Promise<BusinessClock> {
  if (clock) return clock;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_BUSINESS_CLOCK;
    const service = createServiceClient();
    return businessClockOf(await loadClubSchedule(service, await clubIdForUser(service, user.id)));
  } catch {
    return DEFAULT_BUSINESS_CLOCK;
  }
}

export async function loadActorClubSchedule(): Promise<ClubSchedule> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ClubContextError("Unauthorized", 401);
  const service = createServiceClient();
  const clubId = await clubIdForUser(service, user.id);
  return loadClubSchedule(service, clubId);
}
