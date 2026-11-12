import { SupabaseClient } from "@supabase/supabase-js";
import { BaseRepository } from "./base-repository";
import type { CourtSlotDB, CreateCourtSlotInput, CourtSlotWithCourt } from "@/models/db/court";
import { throwSlotRpcError } from "@/lib/slot-credit-rpc";

export class CourtSlotsRepository extends BaseRepository {
  /**
   * Get court slots for a specific date
   */
  async findByDate(date: string): Promise<CourtSlotWithCourt[]> {
    const { data, error } = await this.supabase
      .from("court_slots")
      .select(
        `
        id,
        user_uid,
        court_id,
        slot_date,
        start_time,
        end_time,
        was_played,
        notes,
        player1_payment_method_id,
        player1_note,
        player2_payment_method_id,
        player2_note,
        player3_payment_method_id,
        player3_note,
        player4_payment_method_id,
        player4_note,
        player1_id,
        player2_id,
        player3_id,
        player4_id,
        created_at,
        court:court_id (
          id,
          name
        ),
        player1_payment_method:player1_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player2_payment_method:player2_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player3_payment_method:player3_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player4_payment_method:player4_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player1:player1_id (
          id,
          first_name,
          last_name
        ),
        player2:player2_id (
          id,
          first_name,
          last_name
        ),
        player3:player3_id (
          id,
          first_name,
          last_name
        ),
        player4:player4_id (
          id,
          first_name,
          last_name
        )
      `
      )
      .eq("slot_date", date)
      .order("start_time", { ascending: true })
      .order("court_id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch court slots: ${error.message}`);
    }

    // Normalize relations (Supabase returns array for relations)
    return (data ?? []).map((item: any) => ({
      ...item,
      court: Array.isArray(item.court) ? (item.court[0] || null) : item.court,
      player1_payment_method: Array.isArray(item.player1_payment_method) ? (item.player1_payment_method[0] || null) : item.player1_payment_method,
      player2_payment_method: Array.isArray(item.player2_payment_method) ? (item.player2_payment_method[0] || null) : item.player2_payment_method,
      player3_payment_method: Array.isArray(item.player3_payment_method) ? (item.player3_payment_method[0] || null) : item.player3_payment_method,
      player4_payment_method: Array.isArray(item.player4_payment_method) ? (item.player4_payment_method[0] || null) : item.player4_payment_method,
      player1: Array.isArray(item.player1) ? (item.player1[0] || null) : item.player1,
      player2: Array.isArray(item.player2) ? (item.player2[0] || null) : item.player2,
      player3: Array.isArray(item.player3) ? (item.player3[0] || null) : item.player3,
      player4: Array.isArray(item.player4) ? (item.player4[0] || null) : item.player4,
    })) as CourtSlotWithCourt[];
  }

  /**
   * Get a single court slot by ID
   */
  async findById(slotId: number): Promise<CourtSlotWithCourt | null> {
    const { data, error } = await this.supabase
      .from("court_slots")
      .select(
        `
        id,
        user_uid,
        court_id,
        slot_date,
        start_time,
        end_time,
        was_played,
        notes,
        player1_payment_method_id,
        player1_note,
        player2_payment_method_id,
        player2_note,
        player3_payment_method_id,
        player3_note,
        player4_payment_method_id,
        player4_note,
        player1_id,
        player2_id,
        player3_id,
        player4_id,
        created_at,
        court:court_id (
          id,
          name
        ),
        player1_payment_method:player1_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player2_payment_method:player2_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player3_payment_method:player3_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player4_payment_method:player4_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player1:player1_id (
          id,
          first_name,
          last_name
        ),
        player2:player2_id (
          id,
          first_name,
          last_name
        ),
        player3:player3_id (
          id,
          first_name,
          last_name
        ),
        player4:player4_id (
          id,
          first_name,
          last_name
        )
      `
      )
      .eq("id", slotId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Not found
      }
      throw new Error(`Failed to fetch court slot: ${error.message}`);
    }

    // Normalize relations (Supabase returns array for relations)
    const normalized = {
      ...data,
      court: Array.isArray(data.court) ? (data.court[0] || null) : data.court,
      player1_payment_method: Array.isArray(data.player1_payment_method) ? (data.player1_payment_method[0] || null) : data.player1_payment_method,
      player2_payment_method: Array.isArray(data.player2_payment_method) ? (data.player2_payment_method[0] || null) : data.player2_payment_method,
      player3_payment_method: Array.isArray(data.player3_payment_method) ? (data.player3_payment_method[0] || null) : data.player3_payment_method,
      player4_payment_method: Array.isArray(data.player4_payment_method) ? (data.player4_payment_method[0] || null) : data.player4_payment_method,
      player1: Array.isArray(data.player1) ? (data.player1[0] || null) : data.player1,
      player2: Array.isArray(data.player2) ? (data.player2[0] || null) : data.player2,
      player3: Array.isArray(data.player3) ? (data.player3[0] || null) : data.player3,
      player4: Array.isArray(data.player4) ? (data.player4[0] || null) : data.player4,
    };
    return normalized as CourtSlotWithCourt;
  }

  /**
   * Create a new court slot
   */
  async create(input: CreateCourtSlotInput): Promise<CourtSlotWithCourt> {
    const { data, error } = await this.supabase
      .from("court_slots")
      .insert({
        court_id: input.court_id,
        slot_date: input.slot_date,
        start_time: input.start_time,
        end_time: input.end_time,
        was_played: input.was_played ?? false, // Default to not played
        notes: input.notes ?? null,
        player1_payment_method_id: input.player1_payment_method_id ?? null,
        player1_note: input.player1_note ?? null,
        player2_payment_method_id: input.player2_payment_method_id ?? null,
        player2_note: input.player2_note ?? null,
        player3_payment_method_id: input.player3_payment_method_id ?? null,
        player3_note: input.player3_note ?? null,
        player4_payment_method_id: input.player4_payment_method_id ?? null,
        player4_note: input.player4_note ?? null,
        user_uid: this.userId,
      })
      .select(
        `
        id,
        user_uid,
        court_id,
        slot_date,
        start_time,
        end_time,
        was_played,
        notes,
        player1_payment_method_id,
        player1_note,
        player2_payment_method_id,
        player2_note,
        player3_payment_method_id,
        player3_note,
        player4_payment_method_id,
        player4_note,
        player1_id,
        player2_id,
        player3_id,
        player4_id,
        created_at,
        court:court_id (
          id,
          name
        ),
        player1_payment_method:player1_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player2_payment_method:player2_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player3_payment_method:player3_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player4_payment_method:player4_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player1:player1_id (
          id,
          first_name,
          last_name
        ),
        player2:player2_id (
          id,
          first_name,
          last_name
        ),
        player3:player3_id (
          id,
          first_name,
          last_name
        ),
        player4:player4_id (
          id,
          first_name,
          last_name
        )
      `
      )
      .single();

    if (error) {
      throw new Error(`Failed to create court slot: ${error.message}`);
    }

    // Normalize relations (Supabase returns array for relations)
    const normalized = {
      ...data,
      court: Array.isArray(data.court) ? (data.court[0] || null) : data.court,
      player1_payment_method: Array.isArray(data.player1_payment_method) ? (data.player1_payment_method[0] || null) : data.player1_payment_method,
      player2_payment_method: Array.isArray(data.player2_payment_method) ? (data.player2_payment_method[0] || null) : data.player2_payment_method,
      player3_payment_method: Array.isArray(data.player3_payment_method) ? (data.player3_payment_method[0] || null) : data.player3_payment_method,
      player4_payment_method: Array.isArray(data.player4_payment_method) ? (data.player4_payment_method[0] || null) : data.player4_payment_method,
      player1: Array.isArray(data.player1) ? (data.player1[0] || null) : data.player1,
      player2: Array.isArray(data.player2) ? (data.player2[0] || null) : data.player2,
      player3: Array.isArray(data.player3) ? (data.player3[0] || null) : data.player3,
      player4: Array.isArray(data.player4) ? (data.player4[0] || null) : data.player4,
    };
    return normalized as CourtSlotWithCourt;
  }

  /**
   * Create multiple court slots in bulk
   */
  async createMany(inputs: CreateCourtSlotInput[]): Promise<CourtSlotWithCourt[]> {
    const slots = inputs.map((input) => ({
      court_id: input.court_id,
      slot_date: input.slot_date,
      start_time: input.start_time,
      end_time: input.end_time,
      was_played: input.was_played ?? true, // Default to played
      notes: input.notes ?? null,
      player1_payment_method_id: input.player1_payment_method_id ?? null,
      player1_note: input.player1_note ?? null,
      player2_payment_method_id: input.player2_payment_method_id ?? null,
      player2_note: input.player2_note ?? null,
      player3_payment_method_id: input.player3_payment_method_id ?? null,
      player3_note: input.player3_note ?? null,
      player4_payment_method_id: input.player4_payment_method_id ?? null,
      player4_note: input.player4_note ?? null,
      user_uid: this.userId,
    }));

    const { data, error } = await this.supabase
      .from("court_slots")
      .insert(slots)
      .select(
        `
        id,
        user_uid,
        court_id,
        slot_date,
        start_time,
        end_time,
        was_played,
        notes,
        player1_payment_method_id,
        player1_note,
        player2_payment_method_id,
        player2_note,
        player3_payment_method_id,
        player3_note,
        player4_payment_method_id,
        player4_note,
        player1_id,
        player2_id,
        player3_id,
        player4_id,
        created_at,
        court:court_id (
          id,
          name
        ),
        player1_payment_method:player1_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player2_payment_method:player2_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player3_payment_method:player3_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player4_payment_method:player4_payment_method_id (
          id,
          name,
          consumes_slot_credit
        ),
        player1:player1_id (
          id,
          first_name,
          last_name
        ),
        player2:player2_id (
          id,
          first_name,
          last_name
        ),
        player3:player3_id (
          id,
          first_name,
          last_name
        ),
        player4:player4_id (
          id,
          first_name,
          last_name
        )
      `
      );

    if (error) {
      throw new Error(`Failed to create court slots: ${error.message}`);
    }

    // Normalize relations (Supabase returns array for relations)
    return (data ?? []).map((item: any) => ({
      ...item,
      court: Array.isArray(item.court) ? (item.court[0] || null) : item.court,
      player1_payment_method: Array.isArray(item.player1_payment_method) ? (item.player1_payment_method[0] || null) : item.player1_payment_method,
      player2_payment_method: Array.isArray(item.player2_payment_method) ? (item.player2_payment_method[0] || null) : item.player2_payment_method,
      player3_payment_method: Array.isArray(item.player3_payment_method) ? (item.player3_payment_method[0] || null) : item.player3_payment_method,
      player4_payment_method: Array.isArray(item.player4_payment_method) ? (item.player4_payment_method[0] || null) : item.player4_payment_method,
      player1: Array.isArray(item.player1) ? (item.player1[0] || null) : item.player1,
      player2: Array.isArray(item.player2) ? (item.player2[0] || null) : item.player2,
      player3: Array.isArray(item.player3) ? (item.player3[0] || null) : item.player3,
      player4: Array.isArray(item.player4) ? (item.player4[0] || null) : item.player4,
    })) as CourtSlotWithCourt[];
  }

  /**
   * Update a court slot
   */
  async update(
    slotId: number,
    updates: Partial<Omit<CourtSlotDB, "id" | "user_uid" | "created_at">>
  ): Promise<CourtSlotWithCourt> {
    const { error } = await this.supabase.rpc("save_court_slot", {
      p_slot_id: slotId,
      p_patch: updates,
    });
    throwSlotRpcError(error);

    const slot = await this.findById(slotId);
    if (!slot) {
      throw new Error("Court slot not found");
    }
    return slot;
  }

  /**
   * Count slots for a specific date
   */
  async countByDate(date: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("court_slots")
      .select("*", { count: "exact", head: true })
      .eq("slot_date", date);

    if (error) {
      throw new Error(`Failed to count court slots: ${error.message}`);
    }

    return count ?? 0;
  }

  /**
   * Delete a court slot
   */
  async delete(slotId: number): Promise<void> {
    const { error } = await this.supabase.rpc("delete_court_slot", {
      p_slot_id: slotId,
    });
    throwSlotRpcError(error);
  }

  /**
   * Generate slots for a date
   * Returns existing slots if they already exist for that date
   */
  async generateSlotsForDate(
    date: string,
    config: {
      startHour: string;
      endHour: string;
      durationMinutes: number;
    },
    courtIds: number[]
  ): Promise<CourtSlotWithCourt[]> {
    // Check if slots already exist
    const existingSlots = await this.findByDate(date);
    if (existingSlots.length > 0) {
      return existingSlots;
    }

    // Generate time slots
    const [year, month, day] = date.split('-').map(Number);
    const [startH, startM] = config.startHour.split(':').map(Number);
    const [endH, endM] = config.endHour.split(':').map(Number);

    // Detectar si endHour cruza la medianoche (endHour < startHour, ej: 01:00 < 10:00)
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const crossesMidnight = endMinutes < startMinutes;

    // Si cruza la medianoche, generar slots hasta 23:30 y luego agregar el slot adicional
    const effectiveEndHour = crossesMidnight ? "23:30" : config.endHour;

    let current = new Date(year, month - 1, day, startH, startM, 0);
    const [effectiveEndH, effectiveEndM] = effectiveEndHour.split(':').map(Number);
    const dayEnd = new Date(year, month - 1, day, effectiveEndH, effectiveEndM, 0);

    const toTimeString = (d: Date) => {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const timeSlots: { start: string; end: string }[] = [];

    while (current <= dayEnd) {
      const next = new Date(current.getTime() + config.durationMinutes * 60 * 1000);
      if (next > dayEnd) {
        next.setTime(dayEnd.getTime());
      }

      timeSlots.push({
        start: toTimeString(current),
        end: toTimeString(next),
      });

      if (next >= dayEnd) break;
      current = next;
    }

    // Si cruza la medianoche, agregar el slot adicional de 23:30 a 01:00
    if (crossesMidnight) {
      timeSlots.push({
        start: "23:30",
        end: config.endHour, // Será "01:00"
      });
    }

    if (timeSlots.length === 0) {
      throw new Error("No time slots generated with current config");
    }

    // Create slots for each court
    const slotsToCreate: CreateCourtSlotInput[] = [];
    for (const courtId of courtIds) {
      for (const ts of timeSlots) {
        slotsToCreate.push({
          court_id: courtId,
          slot_date: date,
          start_time: ts.start,
          end_time: ts.end,
          was_played: false, // Default to not played
        });
      }
    }

    return await this.createMany(slotsToCreate);
  }
}

