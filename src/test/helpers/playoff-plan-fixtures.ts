import {
  createMockQueryBuilder,
  createMockSupabaseClient,
} from "@/test/mock-supabase-client";

export const PLAYOFF_PLAN_TOURNAMENT_ID = 77;
export const GROUP_A = 500;
export const GROUP_B = 501;

export function zoneOfFourFinishedMatches(groupId: number, teamBase: number) {
  const t = (n: number) => teamBase + n - 1;
  return [
    {
      id: groupId * 10 + 1,
      tournament_group_id: groupId,
      team1_id: t(1),
      team2_id: t(4),
      team1_sets: 2,
      team2_sets: 0,
      team1_games_total: 12,
      team2_games_total: 4,
      status: "finished",
      match_order: 1,
      court_id: 1,
    },
    {
      id: groupId * 10 + 2,
      tournament_group_id: groupId,
      team1_id: t(2),
      team2_id: t(3),
      team1_sets: 2,
      team2_sets: 0,
      team1_games_total: 12,
      team2_games_total: 5,
      status: "finished",
      match_order: 2,
      court_id: 1,
    },
    {
      id: groupId * 10 + 3,
      tournament_group_id: groupId,
      team1_id: t(1),
      team2_id: t(2),
      team1_sets: 2,
      team2_sets: 1,
      team1_games_total: 14,
      team2_games_total: 10,
      status: "finished",
      match_order: 3,
      court_id: 1,
    },
    {
      id: groupId * 10 + 4,
      tournament_group_id: groupId,
      team1_id: t(3),
      team2_id: t(4),
      team1_sets: 2,
      team2_sets: 0,
      team1_games_total: 12,
      team2_games_total: 6,
      status: "finished",
      match_order: 4,
      court_id: 1,
    },
  ];
}

export function zoneOfThreeFinishedMatches(groupId: number, teamBase: number) {
  const t = (n: number) => teamBase + n - 1;
  return [
    {
      id: groupId * 10 + 1,
      tournament_group_id: groupId,
      team1_id: t(1),
      team2_id: t(2),
      team1_sets: 2,
      team2_sets: 0,
      team1_games_total: 12,
      team2_games_total: 4,
      status: "finished",
      match_order: null,
      court_id: 1,
    },
    {
      id: groupId * 10 + 2,
      tournament_group_id: groupId,
      team1_id: t(1),
      team2_id: t(3),
      team1_sets: 2,
      team2_sets: 1,
      team1_games_total: 14,
      team2_games_total: 10,
      status: "finished",
      match_order: null,
      court_id: 1,
    },
    {
      id: groupId * 10 + 3,
      tournament_group_id: groupId,
      team1_id: t(2),
      team2_id: t(3),
      team1_sets: 2,
      team2_sets: 0,
      team1_games_total: 12,
      team2_games_total: 5,
      status: "finished",
      match_order: null,
      court_id: 1,
    },
  ];
}

export type PlayoffPlanMockOptions = {
  groups: Array<{ id: number; name: string; group_order: number }>;
  groupTeams: Array<{ tournament_group_id: number; team_id: number }>;
  matches: Array<Record<string, unknown>>;
  teamLabels?: Array<{ id: number; display_name: string | null }>;
};

export function createSupabaseForPlayoffPlan(options: PlayoffPlanMockOptions) {
  const labels =
    options.teamLabels ??
    options.groupTeams.map((gt) => ({
      id: gt.team_id,
      display_name: `Equipo ${gt.team_id}`,
    }));

  return createMockSupabaseClient({
    tournament_groups: () =>
      createMockQueryBuilder({ data: options.groups, error: null }),
    tournament_group_teams: () =>
      createMockQueryBuilder({ data: options.groupTeams, error: null }),
    tournament_matches: () =>
      createMockQueryBuilder({ data: options.matches, error: null }),
    tournament_teams: () =>
      createMockQueryBuilder({
        data: labels.map((l) => ({
          ...l,
          player1: null,
          player2: null,
        })),
        error: null,
      }),
  });
}

export function supabaseSingleZoneOfFour() {
  return createSupabaseForPlayoffPlan({
    groups: [{ id: GROUP_A, name: "A", group_order: 1 }],
    groupTeams: [1, 2, 3, 4].map((team_id) => ({
      tournament_group_id: GROUP_A,
      team_id,
    })),
    matches: zoneOfFourFinishedMatches(GROUP_A, 1),
  });
}

export function supabaseTwoZonesOfFourEightTeams() {
  return createSupabaseForPlayoffPlan({
    groups: [
      { id: GROUP_A, name: "A", group_order: 1 },
      { id: GROUP_B, name: "B", group_order: 2 },
    ],
    groupTeams: [
      ...[1, 2, 3, 4].map((team_id) => ({
        tournament_group_id: GROUP_A,
        team_id,
      })),
      ...[5, 6, 7, 8].map((team_id) => ({
        tournament_group_id: GROUP_B,
        team_id,
      })),
    ],
    matches: [
      ...zoneOfFourFinishedMatches(GROUP_A, 1),
      ...zoneOfFourFinishedMatches(GROUP_B, 5),
    ],
  });
}

export const VALID_PLAYOFF_SCHEDULE_BODY = {
  days: [{ date: "2026-08-15", startTime: "08:00", endTime: "22:00" }],
  matchDuration: 60,
  courtIds: [1, 2],
};

export function wrapSupabaseForSinglePreview(
  planClient: ReturnType<typeof createSupabaseForPlayoffPlan>,
  tournamentId: number,
  tournamentOverrides?: Partial<{
    status: string;
    name: string;
  }>
) {
  const base = planClient.from as ReturnType<typeof import("vitest").vi.fn>;
  return {
    from: (table: string) => {
      if (table === "tournaments") {
        return createMockQueryBuilder({
          data: {
            id: tournamentId,
            name: tournamentOverrides?.name ?? "Copa test",
            status: tournamentOverrides?.status ?? "playoffs_ready",
            match_duration: 60,
            match_duration_quarters_onwards: 60,
          },
          error: null,
        });
      }
      if (table === "tournament_playoffs") {
        return createMockQueryBuilder({ data: [], error: null });
      }
      return base(table);
    },
  };
}

export function wrapSupabaseForBulkPreview(
  planClient: ReturnType<typeof createSupabaseForPlayoffPlan>,
  tournaments: Array<{ id: number; name: string }>
) {
  const base = planClient.from as ReturnType<typeof import("vitest").vi.fn>;
  return {
    from: (table: string) => {
      if (table === "tournaments") {
        return createMockQueryBuilder({
          data: tournaments.map((t) => ({
            ...t,
            match_duration: 60,
            match_duration_quarters_onwards: 60,
          })),
          error: null,
        });
      }
      return base(table);
    },
  };
}
