import { describe, expect, it } from "vitest";
import { courtOccupancy, turnUsesCourt, windowMinutes } from "@/lib/court-occupancy";

const courts = [
  { id: 1, name: "Central" },
  { id: 2, name: "Cancha 2" },
];

describe("horario de ocupación", () => {
  it("mide un rango del mismo día y uno que cruza la medianoche", () => {
    expect(windowMinutes("18:00", "23:00")).toBe(300);
    expect(windowMinutes("22:00", "01:00")).toBe(180);
    expect(windowMinutes("10:00", "10:00")).toBe(0);
  });
});

describe("qué turno ocupa la cancha", () => {
  it("un turno vacío de la grilla queda libre", () => {
    expect(turnUsesCourt({ wasPlayed: false, reserved: false, hasPlayer: false })).toBe(false);
  });

  it("ocupa si se jugó, si está reservado o si tiene un jugador", () => {
    expect(turnUsesCourt({ wasPlayed: true, reserved: false, hasPlayer: false })).toBe(true);
    expect(turnUsesCourt({ wasPlayed: false, reserved: true, hasPlayer: false })).toBe(true);
    expect(turnUsesCourt({ wasPlayed: false, reserved: false, hasPlayer: true })).toBe(true);
  });
});

describe("índice de ocupación", () => {
  it("un día vacío está libre", () => {
    const result = courtOccupancy({
      courts,
      dates: ["2026-11-23"],
      startTime: "18:00",
      endTime: "20:00",
      blocks: [],
    });
    expect(result.availableMinutes).toBe(240);
    expect(result.usedMinutes).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("suma el turno y recorta lo que cae fuera del horario", () => {
    const result = courtOccupancy({
      courts: [courts[0]],
      dates: ["2026-11-23"],
      startTime: "18:00",
      endTime: "20:00",
      blocks: [
        { courtId: 1, date: "2026-11-23", start: "19:00", end: "20:30" },
      ],
    });
    expect(result.usedMinutes).toBe(60);
    expect(result.availableMinutes).toBe(120);
    expect(result.percent).toBe(50);
  });

  it("no cuenta dos veces una clase que pisa un turno", () => {
    const result = courtOccupancy({
      courts: [courts[0]],
      dates: ["2026-11-23"],
      startTime: "18:00",
      endTime: "21:00",
      blocks: [
        { courtId: 1, date: "2026-11-23", start: "18:00", end: "19:30" },
        { courtId: 1, date: "2026-11-23", start: "19:00", end: "20:00" },
      ],
    });
    expect(result.usedMinutes).toBe(120);
    expect(result.percent).toBe(67);
  });

  it("incluye la hora de la madrugada cuando el horario cruza la medianoche", () => {
    const result = courtOccupancy({
      courts: [courts[0]],
      dates: ["2026-11-23"],
      startTime: "22:00",
      endTime: "01:00",
      blocks: [
        { courtId: 1, date: "2026-11-23", start: "23:30", end: "01:00" },
        { courtId: 1, date: "2026-11-23", start: "00:15", end: "00:45" },
      ],
    });
    expect(result.usedMinutes).toBe(90);
    expect(result.availableMinutes).toBe(180);
    expect(result.percent).toBe(50);
  });

  it("separa las canchas y suma el mes por los minutos de cada día", () => {
    const result = courtOccupancy({
      courts,
      dates: ["2026-11-23", "2026-11-24"],
      startTime: "18:00",
      endTime: "19:00",
      blocks: [
        { courtId: 1, date: "2026-11-23", start: "18:00", end: "19:00" },
        { courtId: 2, date: "2026-11-24", start: "18:00", end: "18:30" },
      ],
    });
    expect(result.courts[0]).toMatchObject({ courtName: "Central", usedMinutes: 60, availableMinutes: 120, percent: 50 });
    expect(result.courts[1]).toMatchObject({ courtName: "Cancha 2", usedMinutes: 30, availableMinutes: 120, percent: 25 });
    expect(result.usedMinutes).toBe(90);
    expect(result.availableMinutes).toBe(240);
    expect(result.percent).toBe(38);
  });

  it("suma el mismo horario en dos días y no los pisa", () => {
    const result = courtOccupancy({
      courts: [courts[0]],
      dates: ["2026-11-23", "2026-11-24"],
      startTime: "13:00",
      endTime: "23:30",
      blocks: [
        { courtId: 1, date: "2026-11-23", start: "18:00", end: "19:30" },
        { courtId: 1, date: "2026-11-24", start: "18:00", end: "19:30" },
      ],
    });
    expect(result.usedMinutes).toBe(180);
    expect(result.availableMinutes).toBe(1260);
    expect(result.percent).toBe(14);
  });
});
