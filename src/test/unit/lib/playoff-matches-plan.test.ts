import { describe, expect, it } from "vitest";
import { generatePlayoffs } from "@/lib/tournament-playoffs";
import {
  buildPlayoffMatchesPlan,
  countPlayoffMatchesNeedingSchedule,
} from "@/lib/playoff-matches-plan";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
} from "@/test/mock-supabase-client";
import {
  GROUP_A,
  PLAYOFF_PLAN_TOURNAMENT_ID,
  supabaseSingleZoneOfFour,
  supabaseTwoZonesOfFourEightTeams,
} from "@/test/helpers/playoff-plan-fixtures";

describe("countPlayoffMatchesNeedingSchedule (lib)", () => {
  it("cuenta partidos con dos equipos o placeholders de ganador", () => {
    const groupOrderMap = new Map([[GROUP_A, 1]]);
    const qualified = [
      { team_id: 1, from_group_id: GROUP_A, pos: 1 },
      { team_id: 2, from_group_id: GROUP_A, pos: 2 },
      { team_id: 3, from_group_id: GROUP_A, pos: 3 },
    ];
    const bracket = generatePlayoffs(qualified, groupOrderMap, 4);
    const needing = countPlayoffMatchesNeedingSchedule(bracket);

    expect(bracket.length).toBeGreaterThan(0);
    expect(needing).toBeGreaterThan(0);
    expect(needing).toBeLessThanOrEqual(bracket.length);
  });

  it("ignora byes sin rival ni source", () => {
    const onlyBye = [
      {
        round: "cuartos",
        bracket_pos: 1,
        team1_id: 10,
        team2_id: null,
        source_team1: null,
        source_team2: null,
      },
    ] as ReturnType<typeof generatePlayoffs>;
    expect(countPlayoffMatchesNeedingSchedule(onlyBye)).toBe(0);
  });
});

describe("buildPlayoffMatchesPlan (lib)", () => {
  it("error si no hay zonas", async () => {
    const supabase = createMockSupabaseClient({
      tournament_groups: () =>
        createMockQueryBuilder({ data: [], error: null }),
    });
    const result = await buildPlayoffMatchesPlan(
      supabase as never,
      PLAYOFF_PLAN_TOURNAMENT_ID
    );
    expect(result).toEqual({ ok: false, error: "No hay zonas en este torneo" });
  });

  it("error si falla la lectura de equipos de zona", async () => {
    const supabase = createMockSupabaseClient({
      tournament_groups: () =>
        createMockQueryBuilder({
          data: [{ id: GROUP_A, name: "A", group_order: 1 }],
          error: null,
        }),
      tournament_group_teams: () =>
        createMockQueryBuilder({
          data: null,
          error: { message: "db" },
        }),
    });
    const result = await buildPlayoffMatchesPlan(
      supabase as never,
      PLAYOFF_PLAN_TOURNAMENT_ID
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/equipos de zona/i);
  });

  it("arma cuadro desde standings de zona de 4", async () => {
    const supabase = supabaseSingleZoneOfFour();
    const result = await buildPlayoffMatchesPlan(
      supabase as never,
      PLAYOFF_PLAN_TOURNAMENT_ID
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.needingSchedule).toBe(
      countPlayoffMatchesNeedingSchedule(result.matches)
    );
    const rounds = new Set(result.matches.map((m) => m.round));
    expect(
      rounds.has("semifinal") || rounds.has("final") || rounds.has("cuartos")
    ).toBe(true);
  });

  it("8 parejas en 2 zonas de 4: usa plantilla de 8 en 1ª ronda", async () => {
    const supabase = supabaseTwoZonesOfFourEightTeams();
    const result = await buildPlayoffMatchesPlan(
      supabase as never,
      PLAYOFF_PLAN_TOURNAMENT_ID
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const firstRound = result.matches.filter((m) => m.round === "cuartos");
    expect(firstRound.length).toBe(4);
    const byes = firstRound.filter((m) => m.team2_id == null).length;
    expect(byes).toBe(2);
  });

  it("error si hay menos de 2 clasificados", async () => {
    const groupId = 900;
    const supabase = createMockSupabaseClient({
      tournament_groups: () =>
        createMockQueryBuilder({
          data: [{ id: groupId, name: "A", group_order: 1 }],
          error: null,
        }),
      tournament_group_teams: () =>
        createMockQueryBuilder({
          data: [{ tournament_group_id: groupId, team_id: 1 }],
          error: null,
        }),
      tournament_matches: () =>
        createMockQueryBuilder({ data: [], error: null }),
    });
    const result = await buildPlayoffMatchesPlan(
      supabase as never,
      PLAYOFF_PLAN_TOURNAMENT_ID
    );
    expect(result).toEqual({
      ok: false,
      error: "No hay suficientes equipos clasificados",
    });
  });
});
