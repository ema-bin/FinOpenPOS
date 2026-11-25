import { createClient } from "@/lib/supabase/server";
import type { CourtPricingDB, CreateCourtPricingInput, UpdateCourtPricingInput } from "@/models/db/court";
import {
  planTariffPublish,
  tariffUnchanged,
  timeInTariffRange,
  type TariffRule,
} from "@/lib/court-pricing-history";

const PRICING_HISTORY_SCRIPT = "Falta aplicar scripts/add-court-pricing-history.sql";

function missingPricingHistory(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /valid_from|valid_until/.test(message)
  );
}

export class CourtPricingRepository {
  private supabase = createClient();

  /**
   * Get all pricing rules for the current user
   */
  async findAll(): Promise<CourtPricingDB[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await this.supabase
      .from("court_pricing")
      .select("*")
      .is("valid_until", null)
      .order("court_id", { ascending: true })
      .order("start_time", { ascending: true });

    if (missingPricingHistory(error)) return this.findEveryRow();
    if (error) throw error;
    return data ?? [];
  }

  async findCovering(date: string): Promise<CourtPricingDB[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await this.supabase
      .from("court_pricing")
      .select("*")
      .lte("valid_from", date)
      .or(`valid_until.is.null,valid_until.gt.${date}`)
      .order("court_id", { ascending: true })
      .order("start_time", { ascending: true });

    if (missingPricingHistory(error)) return this.findEveryRow();
    if (error) throw error;
    return data ?? [];
  }

  async findCoveringRange(from: string, to: string): Promise<CourtPricingDB[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await this.supabase
      .from("court_pricing")
      .select("*")
      .lte("valid_from", to)
      .or(`valid_until.is.null,valid_until.gt.${from}`)
      .order("court_id", { ascending: true })
      .order("start_time", { ascending: true });

    if (missingPricingHistory(error)) return this.findEveryRow();
    if (error) throw error;
    return data ?? [];
  }

  async findHistory(courtId: number): Promise<CourtPricingDB[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await this.supabase
      .from("court_pricing")
      .select("*")
      .eq("court_id", courtId)
      .not("valid_until", "is", null)
      .order("valid_from", { ascending: false })
      .order("start_time", { ascending: true });

    if (missingPricingHistory(error)) return [];
    if (error) throw error;
    return data ?? [];
  }

  private async findEveryRow(): Promise<CourtPricingDB[]> {
    const { data, error } = await this.supabase
      .from("court_pricing")
      .select("*")
      .order("court_id", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Get pricing for a specific court and time
   */
  async findByCourtIdAndTime(
    courtId: number,
    time: string // TIME format "HH:MM"
  ): Promise<CourtPricingDB | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Get all pricing rules for this court and filter in memory
    const allRules = await this.findByCourtId(courtId);
    
    // Find the rule where time is between start_time and end_time
    for (const rule of allRules) {
      const startTime = rule.start_time.slice(0, 5); // HH:MM
      const endTime = rule.end_time.slice(0, 5); // HH:MM
      const checkTime = time.slice(0, 5); // HH:MM
      
      if (timeInTariffRange(checkTime, startTime, endTime)) {
        return rule;
      }
    }
    
    return null;
  }

  /**
   * Get all pricing rules for a specific court
   */
  async findByCourtId(courtId: number): Promise<CourtPricingDB[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await this.supabase
      .from("court_pricing")
      .select("*")
      .eq("court_id", courtId)
      .is("valid_until", null)
      .order("start_time", { ascending: true });

    if (missingPricingHistory(error)) {
      const { data: legacy, error: legacyError } = await this.supabase
        .from("court_pricing")
        .select("*")
        .eq("court_id", courtId)
        .order("start_time", { ascending: true });
      if (legacyError) throw legacyError;
      return legacy ?? [];
    }

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Create a new pricing rule
   */
  async create(input: CreateCourtPricingInput): Promise<CourtPricingDB> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await this.supabase
      .from("court_pricing")
      .insert({
        user_uid: user.id,
        court_id: input.court_id,
        start_time: input.start_time,
        end_time: input.end_time,
        price_per_player: input.price_per_player,
        valid_from: input.valid_from,
        valid_until: null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a pricing rule
   */
  async update(
    id: number,
    input: UpdateCourtPricingInput
  ): Promise<CourtPricingDB> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const updateData: Partial<CourtPricingDB> = {
      updated_at: new Date().toISOString(),
    };

    if (input.start_time !== undefined) updateData.start_time = input.start_time;
    if (input.end_time !== undefined) updateData.end_time = input.end_time;
    if (input.price_per_player !== undefined)
      updateData.price_per_player = input.price_per_player;

    const { data, error } = await this.supabase
      .from("court_pricing")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a pricing rule
   */
  async delete(id: number): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await this.supabase
      .from("court_pricing")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  /**
   * Delete all pricing rules for a court
   */
  async deleteByCourtId(courtId: number): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await this.supabase
      .from("court_pricing")
      .delete()
      .eq("court_id", courtId);

    if (error) throw error;
  }

  /**
   * Publica una tarifa nueva. La fila anterior queda cerrada en valid_from.
   * Si la tarifa vigente ya empieza ese día, se corrige esa fila.
   */
  async publishForCourtId(
    courtId: number,
    rules: TariffRule[],
    validFrom: string
  ): Promise<CourtPricingDB[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const openRows = await this.findByCourtId(courtId);
    if (openRows.some((row) => !row.valid_from)) {
      throw new Error(PRICING_HISTORY_SCRIPT);
    }

    const plan = planTariffPublish(
      openRows.map((row) => ({
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time,
        price_per_player: row.price_per_player,
        valid_from: row.valid_from ?? validFrom,
        valid_until: row.valid_until ?? null,
      })),
      rules,
      validFrom
    );

    if (tariffUnchanged(plan)) return openRows;

    const closed: number[] = [];
    try {
      for (const item of plan.close) {
        const { error } = await this.supabase
          .from("court_pricing")
          .update({ valid_until: item.valid_until, updated_at: new Date().toISOString() })
          .eq("id", item.id);
        if (missingPricingHistory(error)) throw new Error(PRICING_HISTORY_SCRIPT);
        if (error) throw error;
        closed.push(item.id);
      }

      for (const item of plan.update) {
        const { error } = await this.supabase
          .from("court_pricing")
          .update({
            price_per_player: item.price_per_player,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        if (error) throw error;
      }

      for (const id of plan.remove) {
        const { error } = await this.supabase.from("court_pricing").delete().eq("id", id);
        if (error) throw error;
      }

      if (plan.insert.length > 0) {
        const { error } = await this.supabase.from("court_pricing").insert(
          plan.insert.map((rule) => ({
            user_uid: user.id,
            court_id: courtId,
            start_time: rule.start_time,
            end_time: rule.end_time,
            price_per_player: rule.price_per_player,
            valid_from: validFrom,
            valid_until: null,
          }))
        );
        if (missingPricingHistory(error)) throw new Error(PRICING_HISTORY_SCRIPT);
        if (error) throw error;
      }
    } catch (error) {
      for (const id of closed) {
        await this.supabase
          .from("court_pricing")
          .update({ valid_until: null, updated_at: new Date().toISOString() })
          .eq("id", id);
      }
      throw error;
    }

    return this.findByCourtId(courtId);
  }
}
