import { describe, expect, it } from "vitest";
import { interleavePlayoffSlotsAcrossTournaments } from "@/lib/interleave-playoff-slots";
import type { PlayoffScheduleSlot } from "@/lib/playoff-schedule-slots";

function slot(
  date: string,
  startTime: string,
  court_id: number
): PlayoffScheduleSlot {
  return { date, startTime, court_id, endTime: "23:59" };
}

describe("interleave-playoff-slots (lib)", () => {
  it("devuelve mapas vacíos si no hay planes o slots", () => {
    const empty = interleavePlayoffSlotsAcrossTournaments([], []);
    expect(empty.size).toBe(0);

    const plansOnly = interleavePlayoffSlotsAcrossTournaments(
      [slot("2026-01-01", "10:00", 1)],
      []
    );
    expect(plansOnly.size).toBe(0);
  });

  it("reparte en round-robin dentro de cada franja horaria", () => {
    const shared = [
      slot("2026-01-01", "10:00", 1),
      slot("2026-01-01", "10:00", 2),
      slot("2026-01-01", "11:00", 1),
    ];
    const byTour = interleavePlayoffSlotsAcrossTournaments(shared, [
      { id: 1, needing: 2 },
      { id: 2, needing: 1 },
    ]);

    expect(byTour.get(1)).toHaveLength(2);
    expect(byTour.get(2)).toHaveLength(1);
    expect(byTour.get(1)![0]).toMatchObject({ startTime: "10:00", court_id: 1 });
    expect(byTour.get(1)![1]).toMatchObject({ startTime: "11:00", court_id: 1 });
    expect(byTour.get(2)![0]).toMatchObject({ startTime: "10:00", court_id: 2 });
  });

  it("ordena cronológicamente los slots asignados a cada torneo", () => {
    const shared = [
      slot("2026-01-02", "12:00", 1),
      slot("2026-01-01", "18:00", 1),
    ];
    const byTour = interleavePlayoffSlotsAcrossTournaments(shared, [
      { id: 99, needing: 2 },
    ]);
    const assigned = byTour.get(99)!;
    expect(assigned.map((s) => s.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("no asigna más slots de los necesarios por torneo", () => {
    const shared = [
      slot("2026-01-01", "10:00", 1),
      slot("2026-01-01", "10:00", 2),
      slot("2026-01-01", "10:00", 3),
    ];
    const byTour = interleavePlayoffSlotsAcrossTournaments(shared, [
      { id: 1, needing: 1 },
    ]);
    expect(byTour.get(1)).toHaveLength(1);
  });
});
