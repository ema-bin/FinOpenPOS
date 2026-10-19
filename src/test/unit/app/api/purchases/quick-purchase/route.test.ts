import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/purchases/quick-purchase/route";

vi.mock("@/lib/repository-factory", () => ({
  createRepositories: vi.fn(),
}));

vi.mock("@/lib/quick-purchase-entities", () => ({
  resolveQuickPurchaseSupplier: vi.fn().mockResolvedValue({ id: 1, name: "Varios" }),
  resolveQuickPurchaseProduct: vi.fn().mockResolvedValue({ id: 2, name: "Varios" }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createRepositories } from "@/lib/repository-factory";
import { createClient } from "@/lib/supabase/server";

describe("POST /api/purchases/quick-purchase (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400 si falta paymentMethodId", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ amount: 100 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 si monto inválido", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ paymentMethodId: 1, amount: 0 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 si la fecha no es válida", async () => {
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          paymentMethodId: 1,
          amount: 100,
          purchaseDate: "2026-02-31",
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("201/200 crea compra con datos válidos", async () => {
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 1, name: "Efectivo", is_active: true },
              error: null,
            }),
          }),
        }),
      }),
    } as never);

    const createWithItems = vi.fn().mockResolvedValue({
      id: 99,
      total_amount: 150,
      status: "completed",
      transaction_id: 10,
      created_at: "2026-10-19T12:00:00.000Z",
    });
    vi.mocked(createRepositories).mockResolvedValue({
      purchases: { createWithItems },
    } as never);

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          paymentMethodId: 1,
          amount: 150,
          purchaseDate: "2026-10-19",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: 99, total_amount: 150, status: "completed" });
    expect(createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({ created_at: "2026-10-19T12:00:00.000Z" })
    );
  });
});
