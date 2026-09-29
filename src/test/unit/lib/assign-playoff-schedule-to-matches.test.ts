import { describe, expect, it } from "vitest";
import {
  assignPlayoffScheduleSlots,
  assignPlayoffScheduleSlotsAcrossTournamentsByRound,
  validatePlannedTournamentSchedule,
} from "@/lib/assign-playoff-schedule-to-matches";
import type { PlayoffBracketMatch } from "@/lib/playoff-matches-plan";

function playoffMatch(
  round: string,
  pos: number,
  team1: number | null,
  team2: number | null
): PlayoffBracketMatch {
  return {
    round,
    bracket_pos: pos,
    team1_id: team1,
    team2_id: team2,
    source_team1: null,
    source_team2: null,
  };
}

describe("assign-playoff-schedule-to-matches (lib)", () => {
  it("asigna slots en orden de ronda (cuartos antes que semifinal)", () => {
    const matches: PlayoffBracketMatch[] = [
      playoffMatch("semifinal", 1, 1, 2),
      playoffMatch("cuartos", 1, 3, 4),
      playoffMatch("cuartos", 2, 5, 6),
    ];

    const scheduled = assignPlayoffScheduleSlots(
      matches,
      [
        { date: "2026-07-01", startTime: "10:00", court_id: 1 },
        { date: "2026-07-01", startTime: "11:00", court_id: 1 },
        { date: "2026-07-01", startTime: "12:00", court_id: 2 },
      ],
      60
    );

    const cuartos = scheduled.filter((m) => m.round === "cuartos");
    const semi = scheduled.find((m) => m.round === "semifinal")!;

    expect(cuartos[0].start_time).toBe("10:00");
    expect(cuartos[1].start_time).toBe("11:00");
    expect(semi.start_time).toBe("12:00");
    expect(semi.end_time).toBe("13:00");
  });

  it("falla si faltan slots", () => {
    expect(() =>
      assignPlayoffScheduleSlots(
        [playoffMatch("cuartos", 1, 1, 2), playoffMatch("cuartos", 2, 3, 4)],
        [{ date: "2026-07-01", startTime: "10:00", court_id: 1 }],
        60
      )
    ).toThrow(/suficientes slots/i);
  });

  it("assignPlayoffScheduleSlotsAcrossTournamentsByRound intercala por ronda", () => {
    const result = assignPlayoffScheduleSlotsAcrossTournamentsByRound(
      [
        {
          tournamentId: 1,
          playoffMin: 60,
          matches: [playoffMatch("cuartos", 1, 1, 2)],
        },
        {
          tournamentId: 2,
          playoffMin: 60,
          matches: [playoffMatch("cuartos", 1, 3, 4)],
        },
      ],
      [
        { date: "2026-07-01", startTime: "09:00", court_id: 1 },
        { date: "2026-07-01", startTime: "10:00", court_id: 1 },
      ]
    );

    expect(result.get(1)![0].start_time).toBe("09:00");
    expect(result.get(2)![0].start_time).toBe("10:00");
  });

  it("validatePlannedTournamentSchedule detecta campos faltantes", () => {
    const msg = validatePlannedTournamentSchedule({
      id: 1,
      name: "Copa",
      match_duration: 60,
      match_duration_quarters_onwards: 60,
      matches: [
        {
          round: "cuartos",
          bracket_pos: 1,
          team1Label: "1A",
          team2Label: "2B",
          match_date: "2026-07-01",
          start_time: "10:00",
          end_time: null,
          court_id: null,
        },
      ],
    });
    expect(msg).toMatch(/Falta fecha/i);
  });
});
