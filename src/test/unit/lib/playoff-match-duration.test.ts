import { describe, expect, it } from "vitest";
import {
  playoffMatchDurationMinutes,
  slotIntervalMinutesForPlayoffScheduling,
} from "@/lib/playoff-match-duration";

describe("playoff-match-duration (lib)", () => {
  it("usa mínimo 15 minutos aunque la DB traiga menos", () => {
    expect(playoffMatchDurationMinutes(0)).toBe(15);
    expect(playoffMatchDurationMinutes(10)).toBe(15);
    expect(slotIntervalMinutesForPlayoffScheduling(5)).toBe(15);
  });

  it("respeta duración configurada cuando es >= 15", () => {
    expect(playoffMatchDurationMinutes(60)).toBe(60);
    expect(slotIntervalMinutesForPlayoffScheduling(90)).toBe(90);
  });
});
