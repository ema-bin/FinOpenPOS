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
}
