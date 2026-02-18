import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repository for categories (libre / damas).
 * Used to get display_order for category eligibility in puntuable tournaments.
 */
export class CategoriesRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get display_order for each category id.
   * Higher display_order = "better" category (e.g. 3ra > 5ta > 8va).
   * Returns a Map: categoryId -> display_order.
   */
  async getDisplayOrdersByIds(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const unique = Array.from(new Set(ids));
    const { data, error } = await this.supabase
      .from("categories")
      .select("id, display_order")
      .in("id", unique);
    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);
    const map = new Map<number, number>();
    const rows = (data ?? []) as { id: number; display_order: number }[];
    for (const row of rows) {
      map.set(row.id, row.display_order);
    }
    return map;
  }

  /**
   * Get sum_value for each category id (damas: 4ta=4, 5ta=5, 6ta=6, 7ma=7).
   * Used for "suma 13 damas" eligibility. Returns a Map: categoryId -> sum_value (undefined if null).
   */
  async getSumValuesByIds(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();
    const unique = Array.from(new Set(ids));
    const { data, error } = await this.supabase
      .from("categories")
      .select("id, sum_value")
      .in("id", unique);
    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);
    const map = new Map<number, number>();
    const rows = (data ?? []) as { id: number; sum_value: number | null }[];
    for (const row of rows) {
      if (row.sum_value != null) map.set(row.id, row.sum_value);
    }
    return map;
  }
}
