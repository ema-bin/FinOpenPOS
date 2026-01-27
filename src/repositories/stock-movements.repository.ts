import { BaseRepository } from "./base-repository";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StockMovementType = "purchase" | "sale" | "adjustment";

export interface StockMovementAggregationRow {
  product_id: number;
  movement_type: StockMovementType;
  total_quantity: number;
  product_name: string;
  uses_stock: boolean;
  category_id: number | null;
  category_name: string | null;
}

export interface StockMovementsAggregationOptions {
  fromDate?: string;
  toDate?: string;
  categoryId?: number;
}

export class StockMovementsRepository extends BaseRepository {
  constructor(supabase: SupabaseClient, userId: string) {
    super(supabase, userId);
  }

  async aggregateStatistics(
    options: StockMovementsAggregationOptions = {}
  ): Promise<StockMovementAggregationRow[]> {
    const { data, error } = await this.supabase.rpc("stock_movement_statistics", {
      p_from_date: options.fromDate ?? null,
      p_to_date: options.toDate ?? null,
      p_category_id: options.categoryId ?? null,
    });

    if (error) {
      throw new Error("Failed to load stock movements: " + error.message);
    }

    return (data ?? []) as StockMovementAggregationRow[];
  }
}
