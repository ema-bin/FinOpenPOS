import { afterEach, describe, expect, it, vi } from "vitest";
import { purchasesService } from "@/services/purchases.service";

describe("PurchasesService (services)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("quickPurchase envía POST al endpoint correcto", async () => {
    const mockResponse = { id: 42, total_amount: 100, status: "completed" };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await purchasesService.quickPurchase({
      paymentMethodId: 2,
      amount: 100,
      notes: "test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchases/quick-purchase",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paymentMethodId: 2,
          amount: 100,
          notes: "test",
        }),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it("quickPurchase propaga error del API", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Monto inválido" }),
    } as Response);

    await expect(
      purchasesService.quickPurchase({ paymentMethodId: 1, amount: 0 })
    ).rejects.toThrow("Monto inválido");
  });
});
