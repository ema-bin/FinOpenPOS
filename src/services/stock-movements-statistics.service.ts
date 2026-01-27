import {
  StockMovementsRepository,
  StockMovementAggregationRow,
} from "@/repositories/stock-movements.repository";

export interface StockStatisticsItem {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  totalPurchases: number;
  totalSales: number;
  totalAdjustments: number;
  currentStock: number;
}

export interface StockStatisticsOptions {
  fromDate?: string;
  toDate?: string;
  categoryId?: number | null;
}

export class StockMovementsStatisticsService {
  constructor(private readonly repository: StockMovementsRepository) {}

  async getStatistics(
    options: StockStatisticsOptions = {}
  ): Promise<StockStatisticsItem[]> {
    const rows = await this.repository.aggregateStatistics({
      fromDate: options.fromDate,
      toDate: options.toDate,
      categoryId: options.categoryId ?? undefined,
    });

    const stats = new Map<number, StockStatisticsItem>();

    rows.forEach((row: StockMovementAggregationRow) => {
      if (row.uses_stock === false) return;

      const categoryId = row.category_id ?? null;
      const categoryName = row.category_name ?? null;

      const existing = stats.get(row.product_id) || {
        productId: row.product_id,
        productName: row.product_name,
        categoryId,
        categoryName,
        totalPurchases: 0,
        totalSales: 0,
        totalAdjustments: 0,
        currentStock: 0,
      };

      const quantity = Number(row.total_quantity);
      if (row.movement_type === "purchase") {
        existing.totalPurchases += quantity;
        existing.currentStock += quantity;
      } else if (row.movement_type === "sale") {
        existing.totalSales += quantity;
        existing.currentStock -= quantity;
      } else if (row.movement_type === "adjustment") {
        existing.totalAdjustments += quantity;
        existing.currentStock += quantity;
      }

      stats.set(row.product_id, existing);
    });

    const filtered = options.categoryId
      ? Array.from(stats.values()).filter(
          (stat) => stat.categoryId === options.categoryId
        )
      : Array.from(stats.values());

    return filtered.sort((a, b) => a.productName.localeCompare(b.productName));
  }
}
