import { describe, expect, it } from "vitest";
import {
  expandPhysicalWindowsToPlayoffSlotList,
  formatMinutes,
  listAtomicPlayoffSlotWindows,
  parseDayBoundaryMinutes,
} from "@/lib/playoff-expand-selected-slots";

describe("playoff-expand-selected-slots (lib)", () => {
  it("parseDayBoundaryMinutes y formatMinutes son inversos en el día", () => {
    expect(parseDayBoundaryMinutes("10:30")).toBe(630);
    expect(formatMinutes(630)).toBe("10:30");
    expect(formatMinutes(0)).toBe("00:00");
  });

  it("expandPhysicalWindowsToPlayoffSlotList parte ventanas cada 60 min", () => {
    const slots = expandPhysicalWindowsToPlayoffSlotList(
      [
        {
          slotDate: "2026-08-01",
          startTime: "10:00",
          endTime: "13:00",
          courtId: 2,
        },
      ],
      60
    );
    expect(slots).toEqual([
      { date: "2026-08-01", startTime: "10:00", court_id: 2 },
      { date: "2026-08-01", startTime: "11:00", court_id: 2 },
      { date: "2026-08-01", startTime: "12:00", court_id: 2 },
    ]);
  });

  it("ordena ventanas por fecha, hora y cancha", () => {
    const slots = expandPhysicalWindowsToPlayoffSlotList(
      [
        {
          slotDate: "2026-08-02",
          startTime: "09:00",
          endTime: "10:00",
          courtId: 1,
        },
        {
          slotDate: "2026-08-01",
          startTime: "18:00",
          endTime: "19:00",
          courtId: 2,
        },
      ],
      60
    );
    expect(slots.map((s) => `${s.date} ${s.startTime} c${s.court_id}`)).toEqual([
      "2026-08-01 18:00 c2",
      "2026-08-02 09:00 c1",
    ]);
  });

  it("listAtomicPlayoffSlotWindows incluye fin de cada franja", () => {
    const windows = listAtomicPlayoffSlotWindows(
      "2026-08-01",
      "10:00",
      "12:00",
      60
    );
    expect(windows).toEqual([
      { date: "2026-08-01", startTime: "10:00", endTime: "11:00" },
      { date: "2026-08-01", startTime: "11:00", endTime: "12:00" },
    ]);
  });

  it("ventana que cruza medianoche se extiende al día siguiente lógico", () => {
    const slots = expandPhysicalWindowsToPlayoffSlotList(
      [
        {
          slotDate: "2026-08-01",
          startTime: "23:00",
          endTime: "01:00",
          courtId: 1,
        },
      ],
      60
    );
    expect(slots).toHaveLength(2);
    expect(slots[0].startTime).toBe("23:00");
    expect(slots[1].startTime).toBe("00:00");
  });
});
