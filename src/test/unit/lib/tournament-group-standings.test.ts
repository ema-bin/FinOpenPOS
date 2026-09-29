import { describe, expect, it } from "vitest";
import {
  aggregateGroupStandingsFromMatches,
  computeQualifiedTeamsFromStandings,
  groupOfFourForcedPositions,
  rankedStandingsForGroup,
  type StandingsMatchInput,
} from "@/lib/tournament-group-standings";

const G1 = 100;

function finished(
  team1: number,
  team2: number,
  t1Sets: number,
  t2Sets: number,
  extra?: Partial<StandingsMatchInput>
): StandingsMatchInput {
  return {
    tournament_group_id: G1,
    team1_id: team1,
    team2_id: team2,
    team1_sets: t1Sets,
    team2_sets: t2Sets,
    team1_games_total: t1Sets * 6,
    team2_games_total: t2Sets * 6,
    status: "finished",
    ...extra,
  };
}

describe("tournament-group-standings (lib)", () => {
  it("aggregateGroupStandingsFromMatches acumula victorias en zona de 3", () => {
    const map = aggregateGroupStandingsFromMatches([
      finished(1, 2, 2, 0),
      finished(1, 3, 2, 1),
      finished(2, 3, 2, 0),
    ]);

    const g = map.get(G1)!;
    expect(g.get(1)?.wins).toBe(2);
    expect(g.get(2)?.wins).toBe(1);
    expect(g.get(3)?.wins).toBe(0);
  });

  it("desempata por diferencia de sets y games", () => {
    const map = aggregateGroupStandingsFromMatches([
      finished(10, 20, 2, 1),
      finished(10, 30, 2, 0),
      finished(20, 30, 2, 1),
    ]);
    const ranked = rankedStandingsForGroup(
      [10, 20, 30],
      [
        finished(10, 20, 2, 1),
        finished(10, 30, 2, 0),
        finished(20, 30, 2, 1),
      ],
      map.get(G1)!
    );
    expect(ranked[0].team_id).toBe(10);
    expect(ranked[1].team_id).toBe(20);
    expect(ranked[2].team_id).toBe(30);
  });

  it("zona de 4: finales definen posiciones 1–4", () => {
    const matches: StandingsMatchInput[] = [
      finished(1, 4, 2, 0, { match_order: 1 }),
      finished(2, 3, 2, 0, { match_order: 2 }),
      finished(1, 2, 2, 1, { match_order: 3 }),
      finished(3, 4, 2, 0, { match_order: 4 }),
    ];
    const forced = groupOfFourForcedPositions(matches);
    expect(forced?.get(1)).toBe(1);
    expect(forced?.get(2)).toBe(2);
    expect(forced?.get(3)).toBe(3);
    expect(forced?.get(4)).toBe(4);

    const map = aggregateGroupStandingsFromMatches(matches);
    const ranked = rankedStandingsForGroup([1, 2, 3, 4], matches, map.get(G1)!);
    expect(ranked.map((s) => s.team_id)).toEqual([1, 2, 3, 4]);
  });

  it("computeQualifiedTeamsFromStandings clasifica 2 en zona de 3 y 3 en zona de 4", () => {
    const group3 = 10;
    const group4 = 20;
    const matches: StandingsMatchInput[] = [
      {
        ...finished(1, 2, 2, 0),
        tournament_group_id: group3,
      },
      {
        ...finished(1, 3, 2, 0),
        tournament_group_id: group3,
      },
      {
        ...finished(2, 3, 2, 1),
        tournament_group_id: group3,
      },
      {
        ...finished(11, 14, 2, 0, { match_order: 1 }),
        tournament_group_id: group4,
      },
      {
        ...finished(12, 13, 2, 0, { match_order: 2 }),
        tournament_group_id: group4,
      },
      {
        ...finished(11, 12, 2, 1, { match_order: 3 }),
        tournament_group_id: group4,
      },
      {
        ...finished(13, 14, 2, 0, { match_order: 4 }),
        tournament_group_id: group4,
      },
    ];

    const { qualified, placeholderMap } = computeQualifiedTeamsFromStandings({
      groups: [
        { id: group3, group_order: 1 },
        { id: group4, group_order: 2 },
      ],
      groupTeams: [
        { tournament_group_id: group3, team_id: 1 },
        { tournament_group_id: group3, team_id: 2 },
        { tournament_group_id: group3, team_id: 3 },
        { tournament_group_id: group4, team_id: 11 },
        { tournament_group_id: group4, team_id: 12 },
        { tournament_group_id: group4, team_id: 13 },
        { tournament_group_id: group4, team_id: 14 },
      ],
      matches,
    });

    expect(qualified.filter((q) => q.from_group_id === group3)).toHaveLength(2);
    expect(qualified.filter((q) => q.from_group_id === group4)).toHaveLength(3);
    expect(placeholderMap.get(1)).toBe("1A");
    expect(placeholderMap.get(11)).toBe("1B");
  });
});
