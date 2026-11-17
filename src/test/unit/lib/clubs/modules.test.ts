import { describe, expect, it } from "vitest";
import { moduleForPath } from "@/lib/clubs/modules";

describe("módulo de una ruta", () => {
  it("asigna cada sección a su interruptor", () => {
    expect(moduleForPath("/admin/classes")).toBe("classes");
    expect(moduleForPath("/admin/tournaments/4")).toBe("tournaments");
    expect(moduleForPath("/admin/slot-packs")).toBe("packs");
    expect(moduleForPath("/admin/orders/3")).toBe("buffet");
    expect(moduleForPath("/admin/purchases-history")).toBe("buffet");
    expect(moduleForPath("/api/admin/dashboard/sales")).toBe("buffet");
    expect(moduleForPath("/api/admin/dashboard/tournaments")).toBe("tournaments");
  });

  it("deja libres las pantallas que no dependen de un interruptor", () => {
    expect(moduleForPath("/admin")).toBeNull();
    expect(moduleForPath("/admin/court-slots")).toBeNull();
    expect(moduleForPath("/admin/club")).toBeNull();
    expect(moduleForPath("/admin/players")).toBeNull();
    expect(moduleForPath("/admin/balance")).toBeNull();
  });
});
