import { describe, expect, it } from "vitest";
import { settlementRequestWindow } from "@/lib/finance/settlement-window";

describe("ventana del reporte de Mercado Pago", () => {
  it("a las 03:00 del 27 pide el día 26 y el día 27 enteros", () => {
    const window = settlementRequestWindow(
      new Date("2026-11-27T06:00:00.000Z"),
      "America/Argentina/Buenos_Aires",
    );
    expect(window.from).toBe("2026-11-26");
    expect(window.to).toBe("2026-11-27");
    expect(window.beginDate).toBe("2026-11-26T03:00:00Z");
    expect(window.endDate).toBe("2026-11-28T02:59:59Z");
  });
});
