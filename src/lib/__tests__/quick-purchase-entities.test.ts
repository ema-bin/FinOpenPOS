import { describe, expect, it, vi } from "vitest";
import {
  QUICK_PURCHASE_PRODUCT_NAME,
  QUICK_PURCHASE_SUPPLIER_NAME,
  resolveQuickPurchaseProduct,
  resolveQuickPurchaseSupplier,
} from "@/lib/quick-purchase-entities";

describe("quick-purchase-entities (lib)", () => {
  it("expone nombres canónicos", () => {
    expect(QUICK_PURCHASE_SUPPLIER_NAME).toBe("Varios");
    expect(QUICK_PURCHASE_PRODUCT_NAME).toBe("Varios");
  });

  it("resolveQuickPurchaseSupplier reutiliza existente", async () => {
    const existing = { id: 9, name: QUICK_PURCHASE_SUPPLIER_NAME };
    const repos = {
      suppliers: {
        findAll: vi.fn().mockResolvedValue([existing]),
        create: vi.fn(),
      },
    } as unknown as Parameters<typeof resolveQuickPurchaseSupplier>[0];

    const result = await resolveQuickPurchaseSupplier(repos);
    expect(result).toBe(existing);
    expect(repos.suppliers.create).not.toHaveBeenCalled();
  });

  it("resolveQuickPurchaseProduct crea si no existe", async () => {
    const created = { id: 3, name: QUICK_PURCHASE_PRODUCT_NAME };
    const repos = {
      products: {
        findAll: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(created),
      },
    } as unknown as Parameters<typeof resolveQuickPurchaseProduct>[0];

    const result = await resolveQuickPurchaseProduct(repos);
    expect(result).toEqual(created);
    expect(repos.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: QUICK_PURCHASE_PRODUCT_NAME, uses_stock: false })
    );
  });
});
