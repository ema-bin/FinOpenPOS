import { describe, expect, it } from "vitest";
import { quickPurchaseCreatedAt } from "@/lib/quick-purchase-date";

describe("quickPurchaseCreatedAt", () => {
  it("sin fecha deja que la base use el momento del alta", () => {
    expect(quickPurchaseCreatedAt(undefined)).toEqual({ ok: true });
    expect(quickPurchaseCreatedAt("")).toEqual({ ok: true });
  });

  it("guarda el día elegido al mediodía UTC", () => {
    expect(quickPurchaseCreatedAt("2026-10-19")).toEqual({
      ok: true,
      createdAt: "2026-10-19T12:00:00.000Z",
    });
  });

  it("rechaza una fecha imposible", () => {
    expect(quickPurchaseCreatedAt("2026-02-31").ok).toBe(false);
    expect(quickPurchaseCreatedAt("19/10/2026").ok).toBe(false);
  });
});
