import { describe, expect, it } from "vitest";
import {
  applyPlayoffResultsToTeamPoints,
  buildPlayerTournamentPointRows,
  getTournamentYear,
  initialTeamRankingPoints,
  mergeRoundPointsFromDb,
} from "@/lib/tournament-ranking-points-core";

describe("tournament-ranking-points-core (lib)", () => {
  it("mergeRoundPointsFromDb conserva defaults y sobreescribe reglas", () => {
    const map = mergeRoundPointsFromDb([{ round_reached: "cuartos", points: 50 }]);
    expect(map.cuartos).toBe(50);
    expect(map.groups).toBe(10);
  });

  it("getTournamentYear usa end_date o año actual", () => {
    expect(getTournamentYear({ start_date: "2025-03-01", end_date: "2025-04-01" })).toBe(
      2025
    );
    expect(getTournamentYear({ start_date: null, end_date: null })).toBe(
      new Date().getFullYear()
    );
  });

  it("applyPlayoffResultsToTeamPoints asigna campeón y finalista", () => {
    const teamIds = new Set([1, 2, 3, 4]);
    const roundPoints = mergeRoundPointsFromDb(null);
    const teamToPoints = initialTeamRankingPoints([1, 2, 3, 4], roundPoints);

    applyPlayoffResultsToTeamPoints(
      teamToPoints,
      teamIds,
      roundPoints,
      [{ round: "semifinal", match_id: 10 }],
      new Map([
        [
          10,
          { team1_id: 1, team2_id: 3, team1_sets: 2, team2_sets: 0 },
        ],
      ])
    );
    applyPlayoffResultsToTeamPoints(
      teamToPoints,
      teamIds,
      roundPoints,
      [{ round: "final", match_id: 11 }],
      new Map([
        [
          11,
          { team1_id: 1, team2_id: 2, team1_sets: 2, team2_sets: 1 },
        ],
      ])
    );

    expect(teamToPoints.get(1)).toEqual({ points: 100, round_reached: "champion" });
    expect(teamToPoints.get(2)).toEqual({ points: 80, round_reached: "final" });
    expect(teamToPoints.get(3)?.round_reached).toBe("semifinal");
  });

  it("buildPlayerTournamentPointRows duplica puntos por jugador y aplica Grand Prix", () => {
    const teamToPoints = initialTeamRankingPoints([5], { groups: 10 });
    const rows = buildPlayerTournamentPointRows({
      teamList: [{ id: 5, player1_id: 101, player2_id: 102 }],
      teamToPoints,
      tournamentId: 9,
      categoryId: 3,
      year: 2026,
      pointsMultiplier: 2,
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.points === 20)).toBe(true);
  });
});
