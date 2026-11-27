import { describe, expect, it } from "vitest";
import { freeSlotsBlock, freeSlotsStart, type FreeSlotInput } from "@/lib/free-slots-message";

const courts = [
  { id: 1, name: "C1" },
  { id: 2, name: "C2" },
];

function slot(courtId: number, start: string, patch: Partial<FreeSlotInput> = {}): FreeSlotInput {
  return {
    court_id: courtId,
    start_time: `${start}:00`,
    was_played: false,
    reservation_status: "free",
    reservation_source: null,
    class_block: null,
    tournament_block: null,
    ...patch,
  };
}

describe("mensaje de turnos libres", () => {
  it("agrupa las canchas por horario y deja afuera lo ocupado", () => {
    const text = freeSlotsBlock({
      date: "2026-11-27",
      courts,
      openTime: "13:00",
      slots: [
        slot(2, "13:00"),
        slot(1, "13:00"),
        slot(1, "14:30"),
        slot(2, "14:30", { reservation_status: "reserved", reservation_source: "manual" }),
        slot(1, "16:00", { class_block: { label: "Clase" } }),
        slot(2, "16:00"),
        slot(1, "17:30", { reservation_source: "fixed" }),
        slot(2, "17:30", { tournament_block: { label: "Torneo" } }),
        slot(1, "22:00"),
      ],
    });
    expect(text).toBe([
      "*TURNOS LIBRES VIERNES:*",
      "-13:00 hs C1 y C2",
      "-14:30 hs C1",
      "-16:00 hs C2",
      "-22:00 hs C1",
    ].join("\n"));
  });

  it("hoy arranca desde la hora actual y lo de madrugada va al final", () => {
    const text = freeSlotsBlock({
      date: "2026-11-27",
      courts,
      openTime: "13:00",
      fromOrder: 16 * 60 + 10,
      slots: [slot(1, "00:30"), slot(1, "16:00"), slot(1, "17:30"), slot(2, "23:00")],
    });
    expect(text).toBe("*TURNOS LIBRES VIERNES:*\n-17:30 hs C1\n-23:00 hs C2\n-00:30 hs C1");
  });

  it("sin libres lo dice", () => {
    expect(freeSlotsBlock({ date: "2026-11-28", courts, openTime: "13:00", slots: [] }))
      .toBe("*TURNOS LIBRES SÁBADO:*\nSin turnos libres");
  });

  it("después de medianoche sigue el día anterior si el club cierra de madrugada", () => {
    const club = { openTime: "13:00", closeTime: "01:00", overnight: true };
    expect(freeSlotsStart({ date: "2026-11-28", hour: 0, minute: 20, ...club }))
      .toEqual({ date: "2026-11-27", fromOrder: 1460 });
    expect(freeSlotsStart({ date: "2026-11-27", hour: 11, minute: 43, ...club }))
      .toEqual({ date: "2026-11-27", fromOrder: 703 });
  });
});
