import { describe, expect, it, vi } from "vitest";
import { SuppliersRepository } from "@/repositories/suppliers.repository";

describe("SuppliersRepository (repositories)", () => {
  it("findAll filtra activos cuando onlyActive=true", async () => {
    const rows = [{ id: 1, name: "Proveedor A", status: "active" }];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq, order });
    const from = vi.fn().mockReturnValue({ select });

    const repo = new SuppliersRepository({ from } as never, "user-1");
    const result = await repo.findAll({ onlyActive: true });

    expect(from).toHaveBeenCalledWith("suppliers");
    expect(eq).toHaveBeenCalledWith("status", "active");
    expect(result).toEqual(rows);
  });
});
