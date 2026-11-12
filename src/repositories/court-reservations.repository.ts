import { BaseRepository } from "./base-repository";
import { throwReservationRpcError } from "@/lib/court-reservation-rpc";

export type CourtReservationSlot = {
  id: number;
  court_id: number;
  court_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  was_played: boolean;
  reservation_status: "free" | "reserved";
  reservation_source: "manual" | "fixed" | null;
  fixed_booking_id: number | null;
  reserved_player_id: number | null;
  reserved_player_name: string | null;
};

export type CourtFixedBooking = {
  id: number;
  player_id: number;
  player_name: string;
  court_id: number;
  court_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  suspended_from: string | null;
  suspended_until: string | null;
};

export type FixedBookingInput = {
  id: number | null;
  playerId: number;
  courtId: number;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  suspendedFrom: string | null;
  suspendedUntil: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function day(value: unknown): string {
  return String(value).slice(0, 10);
}

function clock(value: unknown): string {
  return String(value).slice(0, 5);
}

export class CourtReservationsRepository extends BaseRepository {
  async listDay(date: string): Promise<CourtReservationSlot[]> {
    const { data, error } = await this.supabase
      .from("court_slots")
      .select(
        `
        id, court_id, slot_date, start_time, end_time, was_played,
        reservation_status, reservation_source, fixed_booking_id, reserved_player_id,
        court:court_id ( id, name ),
        reserved_player:reserved_player_id ( first_name, last_name )
      `
      )
      .eq("slot_date", date)
      .order("start_time", { ascending: true })
      .order("court_id", { ascending: true });
    throwReservationRpcError(error);
    return (data ?? []).map((row) => {
      const court = one(row.court as { id: number; name: string } | { id: number; name: string }[] | null);
      const player = one(
        row.reserved_player as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
      );
      return {
        id: Number(row.id),
        court_id: Number(row.court_id),
        court_name: court?.name ?? "Cancha",
        slot_date: day(row.slot_date),
        start_time: clock(row.start_time),
        end_time: clock(row.end_time),
        was_played: Boolean(row.was_played),
        reservation_status: row.reservation_status === "reserved" ? "reserved" : "free",
        reservation_source: row.reservation_source === "manual" || row.reservation_source === "fixed"
          ? row.reservation_source
          : null,
        fixed_booking_id: row.fixed_booking_id == null ? null : Number(row.fixed_booking_id),
        reserved_player_id: row.reserved_player_id == null ? null : Number(row.reserved_player_id),
        reserved_player_name: player ? `${player.first_name} ${player.last_name}`.trim() : null,
      };
    });
  }

  async listFixedBookings(): Promise<CourtFixedBooking[]> {
    const { data, error } = await this.supabase
      .from("court_fixed_bookings")
      .select(
        `
        id, player_id, court_id, weekday, start_time, end_time,
        valid_from, valid_until, is_active, suspended_from, suspended_until,
        player:player_id ( first_name, last_name ),
        court:court_id ( name )
      `
      )
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });
    throwReservationRpcError(error);
    return (data ?? []).map((row) => {
      const player = one(
        row.player as { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
      );
      const court = one(row.court as { name: string } | { name: string }[] | null);
      return {
        id: Number(row.id),
        player_id: Number(row.player_id),
        player_name: player ? `${player.first_name} ${player.last_name}`.trim() : "Jugador",
        court_id: Number(row.court_id),
        court_name: court?.name ?? "Cancha",
        weekday: Number(row.weekday),
        start_time: clock(row.start_time),
        end_time: clock(row.end_time),
        valid_from: day(row.valid_from),
        valid_until: row.valid_until == null ? null : day(row.valid_until),
        is_active: Boolean(row.is_active),
        suspended_from: row.suspended_from == null ? null : day(row.suspended_from),
        suspended_until: row.suspended_until == null ? null : day(row.suspended_until),
      };
    });
  }

  async reserve(slotId: number, playerId: number): Promise<void> {
    const { error } = await this.supabase.rpc("reserve_court_slot", {
      p_slot_id: slotId,
      p_player_id: playerId,
    });
    throwReservationRpcError(error);
  }

  async setPlayer(slotId: number, playerId: number): Promise<void> {
    const { error } = await this.supabase.rpc("set_court_reservation_player", {
      p_slot_id: slotId,
      p_player_id: playerId,
    });
    throwReservationRpcError(error);
  }

  async cancel(slotId: number): Promise<void> {
    const { error } = await this.supabase.rpc("cancel_court_reservation", { p_slot_id: slotId });
    throwReservationRpcError(error);
  }

  async saveFixedBooking(input: FixedBookingInput): Promise<number> {
    const { data, error } = await this.supabase.rpc("save_court_fixed_booking", {
      p_id: input.id,
      p_player_id: input.playerId,
      p_court_id: input.courtId,
      p_weekday: input.weekday,
      p_start: input.startTime,
      p_end: input.endTime,
      p_valid_from: input.validFrom,
      p_valid_until: input.validUntil,
      p_is_active: input.isActive,
      p_suspended_from: input.suspendedFrom,
      p_suspended_until: input.suspendedUntil,
    });
    throwReservationRpcError(error);
    return Number(data);
  }

  async deactivateFixedBooking(id: number): Promise<void> {
    const { error } = await this.supabase.rpc("deactivate_court_fixed_booking", { p_id: id });
    throwReservationRpcError(error);
  }

  async cancelFixedDate(id: number, date: string): Promise<void> {
    const { error } = await this.supabase.rpc("cancel_fixed_booking_date", {
      p_id: id,
      p_date: date,
    });
    throwReservationRpcError(error);
  }

  async applyDate(date: string): Promise<{ applied: number; skipped: number; conflicts: unknown[] }> {
    const { data, error } = await this.supabase.rpc("apply_fixed_bookings", { p_date: date });
    throwReservationRpcError(error);
    const result = (data ?? {}) as { applied?: number; skipped?: number; conflicts?: unknown[] };
    return {
      applied: Number(result.applied ?? 0),
      skipped: Number(result.skipped ?? 0),
      conflicts: Array.isArray(result.conflicts) ? result.conflicts : [],
    };
  }

  async startRun(weekStart: string, weekEnd: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("court_reservation_runs")
      .insert({ user_uid: this.userId, week_start: weekStart, week_end: weekEnd, status: "running" })
      .select("id")
      .single();
    throwReservationRpcError(error);
    if (!data) throw new Error("No se pudo registrar la generación");
    return Number(data.id);
  }

  async finishRun(
    id: number,
    status: "ok" | "error",
    summary: unknown,
    errorText: string | null
  ): Promise<void> {
    const { error } = await this.supabase
      .from("court_reservation_runs")
      .update({ status, summary, error: errorText, finished_at: new Date().toISOString() })
      .eq("id", id);
    throwReservationRpcError(error);
  }
}
