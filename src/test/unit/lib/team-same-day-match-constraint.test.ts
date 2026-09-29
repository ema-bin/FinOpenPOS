import { describe, expect, it } from "vitest";
import type { GroupMatchPayload } from "@/lib/tournament-scheduler";
import {
  assignmentSatisfiesSameDayCloseTeams,
  buildTeamsNeedSameDayCloseSet,
  teamHasViableSameDayCloseSlots,
} from "@/lib/team-same-day-match-constraint";

const BASE: Omit<GroupMatchPayload, "tournament_group_id" | "team1_id" | "team2_id"> = {
  tournament_id: 1,
  user_uid: "u",
  phase: "group",
  match_date: null,
  start_time: null,
  end_time: null,
};

function slot(date: string, time: string) {
  return { date, datetime: new Date(`${date}T${time}:00`) };
}

describe("team-same-day-match-constraint (lib)", () => {
  it("buildTeamsNeedSameDayCloseSet solo incluye filas marcadas", () => {
    const set = buildTeamsNeedSameDayCloseSet([
      { id: 1, needs_same_day_close_matches: true },
      { id: 2, needs_same_day_close_matches: false },
      { id: 3 },
    ]);
    expect(set).toEqual(new Set([1]));
  });

  it("zona de 3: exige mismo día y inicios cercanos para pareja marcada", () => {
    const matches: GroupMatchPayload[] = [
      { ...BASE, tournament_group_id: 1, team1_id: 10, team2_id: 20 },
      { ...BASE, tournament_group_id: 1, team1_id: 10, team2_id: 30 },
      { ...BASE, tournament_group_id: 1, team1_id: 20, team2_id: 30 },
    ];
    const group = { size: 3 as const, teams: [10, 20, 30], matches };
    const durationMs = 60 * 60 * 1000;
    const need = new Set([10]);

    const ok = assignmentSatisfiesSameDayCloseTeams(
      [slot("2026-06-01", "10:00"), slot("2026-06-01", "12:00"), slot("2026-06-01", "14:00")],
      group,
      need,
      durationMs
    );
    expect(ok).toBe(true);

    const badDay = assignmentSatisfiesSameDayCloseTeams(
      [slot("2026-06-01", "10:00"), slot("2026-06-02", "12:00"), slot("2026-06-01", "14:00")],
      group,
      need,
      durationMs
    );
    expect(badDay).toBe(false);

    const tooFar = assignmentSatisfiesSameDayCloseTeams(
      [slot("2026-06-01", "09:00"), slot("2026-06-01", "14:00"), slot("2026-06-01", "16:00")],
      group,
      need,
      durationMs
    );
    expect(tooFar).toBe(false);
  });

  it("zona de 4: 1ª ronda debe ser cercana a ambos partidos de 2ª ronda", () => {
    const matches: GroupMatchPayload[] = [
      { ...BASE, tournament_group_id: 2, team1_id: 1, team2_id: 4, match_order: 1 },
      { ...BASE, tournament_group_id: 2, team1_id: 2, team2_id: 3, match_order: 2 },
      { ...BASE, tournament_group_id: 2, team1_id: null, team2_id: null, match_order: 3 },
      { ...BASE, tournament_group_id: 2, team1_id: null, team2_id: null, match_order: 4 },
    ];
    const group = { size: 4 as const, teams: [1, 2, 3, 4], matches };
    const durationMs = 60 * 60 * 1000;
    const need = new Set([1]);

    const ok = assignmentSatisfiesSameDayCloseTeams(
      [
        slot("2026-06-01", "10:00"),
        slot("2026-06-01", "10:00"),
        slot("2026-06-01", "12:00"),
        slot("2026-06-01", "12:00"),
      ],
      group,
      need,
      durationMs
    );
    expect(ok).toBe(true);

    const bad = assignmentSatisfiesSameDayCloseTeams(
      [
        slot("2026-06-01", "09:00"),
        slot("2026-06-01", "10:00"),
        slot("2026-06-01", "15:00"),
        slot("2026-06-01", "15:00"),
      ],
      group,
      need,
      durationMs
    );
    expect(bad).toBe(false);
  });

  it("teamHasViableSameDayCloseSlots detecta día con horarios compatibles", () => {
    expect(
      teamHasViableSameDayCloseSlots(
        [
          { date: "2026-06-01", startMinutes: 10 * 60 },
          { date: "2026-06-01", startMinutes: 12 * 60 },
        ],
        3,
        60
      )
    ).toBe(true);

    expect(
      teamHasViableSameDayCloseSlots(
        [{ date: "2026-06-01", startMinutes: 9 * 60 }],
        3,
        60
      )
    ).toBe(false);
  });
});
