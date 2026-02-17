import { SupabaseClient } from "@supabase/supabase-js";
import { BaseRepository } from "./base-repository";
import type {
  Player,
  PlayerStatus,
  CreatePlayerInput,
  FindPlayersOptions,
} from "@/models/db/player";

export class PlayersRepository extends BaseRepository {
  /**
   * Get all players with optional filters
   */
  async findAll(options: FindPlayersOptions = {}): Promise<(Player & { category: string | null; female_category: string | null })[]> {
    let query = this.supabase
      .from("players")
      .select("id, first_name, last_name, phone, status, category_id, female_category_id, gender, created_at, category:categories!category_id(name), female_category:categories!female_category_id(name)");

    if (options.status) {
      if (options.status !== "all") {
        query = query.eq("status", options.status);
      }
    } else if (options.onlyActive) {
      query = query.eq("status", "active");
    }

    if (options.search && options.search.trim() !== "") {
      const searchTerm = options.search.trim();
      query = query.or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
      );
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch players: ${error.message}`);
    }

    const rows = (data ?? []) as Array<Player & { category: { name: string } | null; female_category: { name: string } | null }>;
    return rows.map((row) => {
      const cat = row.category;
      const fcat = row.female_category;
      const { category: _c, female_category: _f, ...rest } = row;
      return { ...rest, category: cat?.name ?? null, female_category: fcat?.name ?? null };
    });
  }

  /**
   * Get a single player by ID
   */
  async findById(playerId: number): Promise<(Player & { category: string | null; female_category: string | null }) | null> {
    const { data, error } = await this.supabase
      .from("players")
      .select("id, first_name, last_name, phone, status, category_id, female_category_id, gender, created_at, category:categories!category_id(name), female_category:categories!female_category_id(name)")
      .eq("id", playerId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Not found
      }
      throw new Error(`Failed to fetch player: ${error.message}`);
    }

    const row = data as Player & { category: { name: string } | null; female_category: { name: string } | null };
    const { category: cat, female_category: fcat, ...rest } = row;
    return { ...rest, category: cat?.name ?? null, female_category: fcat?.name ?? null };
  }

  /**
   * Create a new player
   */
  async create(input: CreatePlayerInput): Promise<Player> {
    const { data, error } = await this.supabase
      .from("players")
      .insert({
        user_uid: this.userId,
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        phone: input.phone,
        status: input.status ?? "active",
        category_id: input.category_id ?? null,
        female_category_id: input.female_category_id ?? null,
        gender: input.gender ?? null,
      })
      .select("id, first_name, last_name, phone, status, category_id, female_category_id, gender, created_at, category:categories!category_id(name), female_category:categories!female_category_id(name)")
      .single();

    if (error) {
      throw new Error(`Failed to create player: ${error.message}`);
    }

    const row = data as Player & { category: { name: string } | null; female_category: { name: string } | null };
    const { category: cat, female_category: fcat, ...rest } = row;
    return { ...rest, category: cat?.name ?? null, female_category: fcat?.name ?? null } as Player & { category: string | null; female_category: string | null };
  }

  /**
   * Update a player
   */
  async update(playerId: number, updates: Partial<Pick<Player, "first_name" | "last_name" | "phone" | "status" | "category_id" | "female_category_id" | "gender">>): Promise<Player & { category: string | null; female_category: string | null }> {
    const { data, error } = await this.supabase
      .from("players")
      .update(updates)
      .eq("id", playerId)
      .select("id, first_name, last_name, phone, status, category_id, female_category_id, gender, created_at, category:categories!category_id(name), female_category:categories!female_category_id(name)")
      .single();

    if (error) {
      throw new Error(`Failed to update player: ${error.message}`);
    }

    const row = data as Player & { category: { name: string } | null; female_category: { name: string } | null };
    const { category: cat, female_category: fcat, ...rest } = row;
    return { ...rest, category: cat?.name ?? null, female_category: fcat?.name ?? null };
  }

  /**
   * Delete a player (soft delete by setting status to inactive)
   */
  async delete(playerId: number): Promise<void> {
    const { error } = await this.supabase
      .from("players")
      .update({ status: "inactive" })
      .eq("id", playerId);

    if (error) {
      throw new Error(`Failed to delete player: ${error.message}`);
    }
  }
}

