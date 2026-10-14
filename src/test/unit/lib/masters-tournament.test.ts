import { describe, expect, it } from "vitest";
import { scheduleMastersRoundRobin } from "@/lib/masters-schedule";
import {
  assignMastersZones,
  buildMastersPlayoffMatches,
  mastersQualifiersForGroup,
  mastersRoundRobinPairs,
  projectedMastersPlayoffMatches,
  rankMastersGroup,
} from "@/lib/masters-tournament";
import type { StandingsMatchInput } from "@/lib/tournament-group-standings";

function finished(
  team1: number,
  team2: number,
  winner: number,
  matchOrder: number
): StandingsMatchInput {
  const team1Wins = winner === team1;
  return {
    tournament_group_id: 10,
    team1_id: team1,
    team2_id: team2,
    team1_sets: team1Wins ? 2 : 0,
    team2_sets: team1Wins ? 0 : 2,
    team1_games_total: team1Wins ? 12 : 4,
    team2_games_total: team1Wins ? 4 : 12,
    status: "finished",
    match_order: matchOrder,
  };
}

describe("Master", () => {
  it("arma dos zonas de 4 con la serpiente de 8 parejas", () => {
    const [zoneA, zoneB] = assignMastersZones([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(zoneA).toEqual([1, 4, 5, 7]);
    expect(zoneB).toEqual([2, 3, 6, 8]);
  });

  it("rechaza una cantidad distinta de 8", () => {
    expect(() => assignMastersZones([1, 2, 3])).toThrow(/8 parejas/);
  });

  it("juega todos contra todos con las dos parejas definidas", () => {
    const pairs = mastersRoundRobinPairs([1, 4, 5, 7]);
    expect(pairs).toHaveLength(6);
    expect(pairs.every(([left, right]) => left != null && right != null)).toBe(true);
    expect(pairs).toEqual([
      [1, 4],
      [1, 5],
      [1, 7],
      [4, 5],
      [4, 7],
      [5, 7],
    ]);
  });

  it("ordena la zona por partidos ganados y no por la final de ganadores", () => {
    const matches = [
      finished(1, 2, 1, 1),
      finished(1, 3, 1, 2),
      finished(2, 3, 2, 3),
      finished(1, 4, 1, 4),
      finished(2, 4, 4, 5),
      finished(3, 4, 4, 6),
    ];
    const ranked = rankMastersGroup(10, [1, 2, 3, 4], matches).map((stat) => stat.team_id);
    expect(ranked).toEqual([1, 4, 2, 3]);
  });

  it("clasifica a los dos primeros", () => {
    const matches = [
      finished(1, 2, 1, 1),
      finished(1, 3, 1, 2),
      finished(2, 3, 2, 3),
      finished(1, 4, 1, 4),
      finished(2, 4, 4, 5),
      finished(3, 4, 4, 6),
    ];
    const qualifiers = mastersQualifiersForGroup(10, 1, [1, 2, 3, 4], matches);
    expect(qualifiers.map((team) => [team.pos, team.team_id])).toEqual([
      [1, 1],
      [2, 4],
    ]);
  });

  it("cruza las semis y deja la final entre ganadores, sin tercer puesto", () => {
    const matches = buildMastersPlayoffMatches([
      { team_id: 11, from_group_id: 1, pos: 1, group_order: 1 },
      { team_id: 12, from_group_id: 1, pos: 2, group_order: 1 },
      { team_id: 21, from_group_id: 2, pos: 1, group_order: 2 },
      { team_id: 22, from_group_id: 2, pos: 2, group_order: 2 },
    ]);
    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      round: "semifinal",
      bracket_pos: 1,
      team1_id: 11,
      team2_id: 22,
    });
    expect(matches[1]).toMatchObject({
      round: "semifinal",
      bracket_pos: 2,
      team1_id: 21,
      team2_id: 12,
    });
    expect(matches[2]).toMatchObject({
      round: "final",
      source_team1: "Ganador Semifinal1",
      source_team2: "Ganador Semifinal2",
      team1_id: null,
      team2_id: null,
    });
    expect(matches.some((match) => match.round === "tercer")).toBe(false);
  });

  it("proyecta el cuadro con las etiquetas de zona antes de jugar", () => {
    const matches = projectedMastersPlayoffMatches();
    expect(matches[0]).toMatchObject({ source_team1: "1A", source_team2: "2B" });
    expect(matches[1]).toMatchObject({ source_team1: "1B", source_team2: "2A" });
  });

  it("asigna cada partido a un horario distinto y no pisa a la misma pareja", () => {
    const matches = mastersRoundRobinPairs([1, 2, 3, 4]).map(([team1_id, team2_id]) => ({
      team1_id,
      team2_id,
    }));
    const result = scheduleMastersRoundRobin({
      matches,
      slots: [
        { id: 1, slot_date: "2026-10-10", start_time: "10:00", end_time: "11:00" },
        { id: 2, slot_date: "2026-10-10", start_time: "11:00", end_time: "12:00" },
        { id: 3, slot_date: "2026-10-10", start_time: "12:00", end_time: "13:00" },
        { id: 4, slot_date: "2026-10-10", start_time: "13:00", end_time: "14:00" },
        { id: 5, slot_date: "2026-10-10", start_time: "14:00", end_time: "15:00" },
        { id: 6, slot_date: "2026-10-10", start_time: "15:00", end_time: "16:00" },
      ],
      courtIds: [7],
      matchDuration: 60,
    });
    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(6);
    const keys = result.assignments.map(
      (assignment) => `${assignment.date}|${assignment.startTime}|${assignment.courtId}`
    );
    expect(new Set(keys).size).toBe(6);
  });

  it("avisa si no alcanzan los horarios", () => {
    const result = scheduleMastersRoundRobin({
      matches: [
        { team1_id: 1, team2_id: 2 },
        { team1_id: 1, team2_id: 3 },
      ],
      slots: [{ id: 1, slot_date: "2026-10-10", start_time: "10:00", end_time: "11:00" }],
      courtIds: [7],
      matchDuration: 60,
    });
    expect(result.success).toBe(false);
    expect(result.assignments).toEqual([]);
  });
});
