import { describe, expect, it, vi } from "vitest";
import { StockMovementsStatisticsService } from "@/services/stock-movements-statistics.service";
import type { StockMovementsRepository } from "@/repositories/stock-movements.repository";

describe("StockMovementsStatisticsService (services)", () => {
  it("agrega compras/ventas y omite productos sin stock", async () => {
    const aggregateStatistics = vi.fn().mockResolvedValue([
      {
        product_id: 1,
        product_name: "Agua",
        category_id: 10,
        category_name: "Bebidas",
        movement_type: "purchase",
        total_quantity: 5,
        uses_stock: true,
      },
      {
        product_id: 2,
        product_name: "Varios",
        category_id: null,
        category_name: null,
        movement_type: "purchase",
        total_quantity: 99,
        uses_stock: false,
      },
      {
        product_id: 1,
        product_name: "Agua",
        category_id: 10,
        category_name: "Bebidas",
        movement_type: "sale",
        total_quantity: 2,
        uses_stock: true,
      },
    ]);

    const repository = { aggregateStatistics } as unknown as StockMovementsRepository;
    const service = new StockMovementsStatisticsService(repository);

    const stats = await service.getStatistics();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      productId: 1,
      totalPurchases: 5,
      totalSales: 2,
      currentStock: 3,
    });
  });
});
