import { describe, expect, it } from "vitest";
import {
  TOURNAMENT_STATUS_LABELS,
  tournamentStatusLabel,
} from "@/lib/tournament-status-labels";

describe("tournament-status-labels (lib)", () => {
  it("traduce estados conocidos", () => {
    expect(tournamentStatusLabel("draft")).toBe("Inscripción");
    expect(tournamentStatusLabel("schedule_review")).toBe("Revisión de horarios");
    expect(tournamentStatusLabel("playoffs_ready")).toBe("Listo para playoffs");
  });

  it("TOURNAMENT_STATUS_LABELS cubre todos los estados del tipo", () => {
    const keys = Object.keys(TOURNAMENT_STATUS_LABELS);
    expect(keys).toContain("in_progress");
    expect(keys).toContain("cancelled");
  });
});
