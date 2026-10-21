import { describe, expect, it } from "vitest";
import { planMonthlyCharges } from "@/lib/class-monthly-charge";
import { classBlockForSlot } from "@/lib/class-occupancy";
import { classFitsInDay, enrollmentOnClassDay, freeClassSpots, rangesOverlap, snapClassStart, weekdayOf } from "@/lib/class-time";

describe("cruce de horarios", () => {
  it("una clase de una hora pisa un turno más largo y no el que empieza cuando termina", () => {
    expect(rangesOverlap({ start: "18:00", end: "19:00" }, { start: "18:30", end: "20:00" })).toBe(
      true
    );
    expect(rangesOverlap({ start: "10:00", end: "11:00" }, { start: "11:00", end: "12:30" })).toBe(
      false
    );
    expect(rangesOverlap({ start: "15:30", end: "16:30" }, { start: "16:00", end: "17:00" })).toBe(true);
    expect(rangesOverlap({ start: "15:30", end: "16:30" }, { start: "16:30", end: "17:30" })).toBe(false);
  });

  it("el horario de una clase entra entre las 06:00 y las 00:00", () => {
    expect(classFitsInDay("06:00")).toBe(true);
    expect(classFitsInDay("15:30")).toBe(true);
    expect(classFitsInDay("23:00")).toBe(true);
    expect(classFitsInDay("23:30")).toBe(false);
    expect(classFitsInDay("05:30")).toBe(false);
    expect(snapClassStart(15 * 60 + 20)).toBe("15:30");
    expect(snapClassStart(2 * 60)).toBe("06:00");
  });

  it("el turno de la tarde queda ocupado por la clase de esa cancha", () => {
    const block = classBlockForSlot(
      { court_id: 2, start_time: "18:00:00", end_time: "19:30:00" },
      [
        {
          courtId: 2,
          startTime: "18:30:00",
          endTime: "19:30:00",
          status: "scheduled",
          label: "Seba",
        },
        {
          courtId: 1,
          startTime: "18:30:00",
          endTime: "19:30:00",
          status: "scheduled",
          label: "Manu",
        },
        {
          courtId: 2,
          startTime: "10:00:00",
          endTime: "11:00:00",
          status: "cancelled",
          label: "Cancelada",
        },
      ]
    );
    expect(block).toEqual({ label: "Seba" });
  });

  it("una clase libre muestra 5 lugares y una llena muestra 0", () => {
    expect(freeClassSpots(0)).toBe(5);
    expect(freeClassSpots(4)).toBe(1);
    expect(freeClassSpots(5)).toBe(0);
    expect(freeClassSpots(8)).toBe(0);
  });

  it("el domingo es 0, como el calendario", () => {
    expect(weekdayOf("2026-10-18")).toBe(0);
    expect(weekdayOf("2026-10-19")).toBe(1);
  });

  it("un alta a mitad de semana figura en la clase de esa misma semana", () => {
    expect(enrollmentOnClassDay("2026-10-21", null, "2026-10-20")).toBe(true);
    expect(enrollmentOnClassDay("2026-10-21", null, "2026-10-27")).toBe(true);
    expect(enrollmentOnClassDay("2026-10-21", null, "2026-10-13")).toBe(false);
    expect(enrollmentOnClassDay("2026-10-21", "2026-10-21", "2026-10-27")).toBe(false);
  });
});

describe("deuda mensual de clases", () => {
  const rates = [
    { professorId: 1, weeklyCount: 1, amount: 20000 },
    { professorId: 1, weeklyCount: 2, amount: 35000 },
    { professorId: 2, weeklyCount: 1, amount: 18000 },
  ];

  it("dos clases con Seba y una con Manu son dos deudas, con la tarifa de cada cantidad", () => {
    const plan = planMonthlyCharges(
      "2026-10",
      [
        { playerId: 10, professorId: 1, scheduleId: 1, startedOn: "2026-09-01", endedOn: null },
        { playerId: 10, professorId: 1, scheduleId: 2, startedOn: "2026-10-01", endedOn: null },
        { playerId: 10, professorId: 2, scheduleId: 3, startedOn: "2026-10-06", endedOn: "2026-10-20" },
        { playerId: 10, professorId: 2, scheduleId: 9, startedOn: "2026-11-01", endedOn: null },
      ],
      rates,
      []
    );

    expect(plan.missing).toEqual([]);
    expect(plan.drafts).toEqual([
      { playerId: 10, professorId: 1, weeklyCount: 2, amount: 35000, action: "insert" },
      { playerId: 10, professorId: 2, weeklyCount: 1, amount: 18000, action: "insert" },
    ]);
  });

  it("la misma clase reanudada en el mes cuenta una sola vez", () => {
    const plan = planMonthlyCharges(
      "2026-10",
      [
        { playerId: 10, professorId: 1, scheduleId: 1, startedOn: "2026-10-01", endedOn: "2026-10-10" },
        { playerId: 10, professorId: 1, scheduleId: 1, startedOn: "2026-10-20", endedOn: null },
      ],
      rates,
      []
    );
    expect(plan.drafts[0]?.weeklyCount).toBe(1);
    expect(plan.drafts[0]?.amount).toBe(20000);
  });

  it("no pisa una deuda ya paga y avisa si falta la tarifa", () => {
    const plan = planMonthlyCharges(
      "2026-10",
      [
        { playerId: 10, professorId: 1, scheduleId: 1, startedOn: "2026-10-01", endedOn: null },
        { playerId: 10, professorId: 1, scheduleId: 2, startedOn: "2026-10-01", endedOn: null },
        { playerId: 11, professorId: 2, scheduleId: 3, startedOn: "2026-10-01", endedOn: null },
        { playerId: 11, professorId: 2, scheduleId: 4, startedOn: "2026-10-01", endedOn: null },
      ],
      rates,
      [{ playerId: 10, professorId: 1, status: "paid" }]
    );

    expect(plan.drafts).toEqual([]);
    expect(plan.missing).toEqual([{ playerId: 11, professorId: 2, weeklyCount: 2 }]);
  });

  it("actualiza la deuda pendiente si cambió la cantidad", () => {
    const plan = planMonthlyCharges(
      "2026-10",
      [{ playerId: 10, professorId: 1, scheduleId: 1, startedOn: "2026-10-01", endedOn: null }],
      rates,
      [{ playerId: 10, professorId: 1, status: "pending" }]
    );
    expect(plan.drafts).toEqual([
      { playerId: 10, professorId: 1, weeklyCount: 1, amount: 20000, action: "update" },
    ]);
  });
});
