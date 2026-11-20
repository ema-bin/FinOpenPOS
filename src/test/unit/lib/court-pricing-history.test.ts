import { describe, expect, it } from "vitest";
import {
  coversTariffDate,
  planTariffPublish,
  tariffUnchanged,
  timeInTariffRange,
  type TariffRow,
} from "@/lib/court-pricing-history";

const open = (patch: Partial<TariffRow> & Pick<TariffRow, "id" | "price_per_player">): TariffRow => ({
  start_time: "10:00:00",
  end_time: "13:00:00",
  valid_from: "1970-01-01",
  valid_until: null,
  ...patch,
});

describe("coversTariffDate", () => {
  it("incluye el día de inicio y excluye el día de cierre", () => {
    const row = { valid_from: "2026-11-01", valid_until: "2026-11-20" };
    expect(coversTariffDate(row, "2026-10-31")).toBe(false);
    expect(coversTariffDate(row, "2026-11-01")).toBe(true);
    expect(coversTariffDate(row, "2026-11-19")).toBe(true);
    expect(coversTariffDate(row, "2026-11-20")).toBe(false);
  });

  it("la fila abierta cubre desde su inicio en adelante", () => {
    const row = { valid_from: "2026-11-20", valid_until: null };
    expect(coversTariffDate(row, "2026-11-19")).toBe(false);
    expect(coversTariffDate(row, "2026-11-20")).toBe(true);
    expect(coversTariffDate(row, "2027-01-01")).toBe(true);
  });
});

describe("timeInTariffRange", () => {
  it("incluye las 20:30 en una franja que termina a medianoche", () => {
    expect(timeInTariffRange("20:30", "19:00", "00:00")).toBe(true);
    expect(timeInTariffRange("19:00", "19:00", "00:00")).toBe(true);
    expect(timeInTariffRange("00:00", "19:00", "00:00")).toBe(false);
    expect(timeInTariffRange("18:30", "07:00", "19:00")).toBe(true);
    expect(timeInTariffRange("19:00", "07:00", "19:00")).toBe(false);
  });
});

describe("planTariffPublish", () => {
  it("no escribe nada si el precio no cambió", () => {
    const plan = planTariffPublish(
      [open({ id: 1, price_per_player: 7000 })],
      [{ start_time: "10:00", end_time: "13:00", price_per_player: 7000 }],
      "2026-11-20"
    );
    expect(tariffUnchanged(plan)).toBe(true);
  });

  it("cierra la tarifa anterior e inserta la nueva cuando cambia el precio", () => {
    const plan = planTariffPublish(
      [open({ id: 4, price_per_player: "7000.00" })],
      [{ start_time: "10:00", end_time: "13:00", price_per_player: 8000 }],
      "2026-11-20"
    );
    expect(plan.close).toEqual([{ id: 4, valid_until: "2026-11-20" }]);
    expect(plan.insert).toEqual([
      { start_time: "10:00", end_time: "13:00", price_per_player: 8000 },
    ]);
    expect(plan.update).toEqual([]);
  });

  it("corrige la fila del mismo día sin dejar un hueco", () => {
    const plan = planTariffPublish(
      [open({ id: 4, price_per_player: 8000, valid_from: "2026-11-20" })],
      [{ start_time: "10:00", end_time: "13:00", price_per_player: 7500 }],
      "2026-11-20"
    );
    expect(plan.update).toEqual([{ id: 4, price_per_player: 7500 }]);
    expect(plan.close).toEqual([]);
    expect(plan.insert).toEqual([]);
  });

  it("rechaza una fecha anterior al inicio de la tarifa vigente", () => {
    expect(() =>
      planTariffPublish(
        [open({ id: 4, price_per_player: 8000, valid_from: "2026-11-20" })],
        [{ start_time: "10:00", end_time: "13:00", price_per_player: 9000 }],
        "2026-11-19"
      )
    ).toThrow(/2026-11-20/);
  });
});
