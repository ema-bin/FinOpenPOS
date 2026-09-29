import { describe, expect, it, vi } from "vitest";
import {
  CloseGroupsError,
  runCloseGroups,
} from "@/lib/execute-close-groups";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
} from "@/test/mock-supabase-client";

const TOURNAMENT_ID = 42;
const USER_ID = "user-close-groups";
const GROUP_ID = 500;

function finishedGroupOfThreeMatches() {
  return [
    {
      id: 1,
      tournament_group_id: GROUP_ID,
      team1_id: 1,
      team2_id: 2,
      team1_sets: 2,
      team2_sets: 0,
      team1_games_total: 12,
      team2_games_total: 4,
      status: "finished",
      match_order: null,
      court_id: 1,
    },
    {
      id: 2,
      tournament_group_id: GROUP_ID,
      team1_id: 1,
      team2_id: 3,
      team1_sets: 2,
      team2_sets: 1,
      team1_games_total: 14,
      team2_games_total: 10,
      status: "finished",
      match_order: null,
      court_id: 1,
    },
    {
      id: 3,
      tournament_group_id: GROUP_ID,
      team1_id: 2,
      team2_id: 3,
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

describe("runCloseGroups (integration + Supabase mock)", () => {
  it("404 si el torneo no existe", async () => {
    const supabase = createMockSupabaseClient({
      tournaments: () =>
        createMockQueryBuilder({
          data: null,
          error: { message: "not found" },
        }),
    });

    await expect(
      runCloseGroups(supabase as never, USER_ID, TOURNAMENT_ID, {})
    ).rejects.toMatchObject({ status: 404 });
  });

  it("400 si el torneo no está listo para playoffs", async () => {
    const supabase = createMockSupabaseClient({
      tournaments: () =>
        createMockQueryBuilder({
          data: {
            id: TOURNAMENT_ID,
            status: "draft",
            user_uid: USER_ID,
            match_duration: 60,
            match_duration_quarters_onwards: 60,
          },
          error: null,
        }),
    });

    await expect(
      runCloseGroups(supabase as never, USER_ID, TOURNAMENT_ID, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it("400 si ya hay playoffs generados", async () => {
    const supabase = createMockSupabaseClient({
      tournaments: () =>
        createMockQueryBuilder({
          data: {
            id: TOURNAMENT_ID,
            status: "playoffs_ready",
            user_uid: USER_ID,
            match_duration: 60,
            match_duration_quarters_onwards: 60,
          },
          error: null,
        }),
      tournament_playoffs: () =>
        createMockQueryBuilder({
          data: [{ id: 99 }],
          error: null,
        }),
    });

    await expect(
      runCloseGroups(supabase as never, USER_ID, TOURNAMENT_ID, {})
    ).rejects.toMatchObject({ status: 400 });
  });

  it("cierra zonas y persiste playoffs con zona de 3 completa", async () => {
    const groupMatches = finishedGroupOfThreeMatches();
    const playoffsInsert = vi.fn();
    const matchesInsert = vi.fn();

    const supabase = createMockSupabaseClient({
      tournaments: () => {
        const read = createMockQueryBuilder({
          data: {
            id: TOURNAMENT_ID,
            status: "playoffs_ready",
            user_uid: USER_ID,
            match_duration: 60,
            match_duration_quarters_onwards: 60,
          },
          error: null,
        });
        const update = createMockQueryBuilder({ data: null, error: null });
        let calls = 0;
        return {
          ...read,
          update: vi.fn(() => {
            calls += 1;
            return update;
          }),
        } as ReturnType<typeof createMockQueryBuilder>;
      },
      tournament_playoffs: () => {
        const check = createMockQueryBuilder({ data: [], error: null });
        const insertBuilder = createMockQueryBuilder({ data: null, error: null });
        insertBuilder.insert = vi.fn(() => {
          playoffsInsert();
          return insertBuilder;
        });
        let call = 0;
        return {
          ...check,
          insert: insertBuilder.insert,
        } as ReturnType<typeof createMockQueryBuilder>;
      },
      tournament_groups: () =>
        createMockQueryBuilder({
          data: [
            { id: GROUP_ID, name: "Zona A", group_order: 1 },
          ],
          error: null,
        }),
      tournament_group_teams: () =>
        createMockQueryBuilder({
          data: [
            { tournament_group_id: GROUP_ID, team_id: 1 },
            { tournament_group_id: GROUP_ID, team_id: 2 },
            { tournament_group_id: GROUP_ID, team_id: 3 },
          ],
          error: null,
        }),
      tournament_matches: () => {
        const list = createMockQueryBuilder({ data: groupMatches, error: null });
        const insertBuilder = createMockQueryBuilder({
          data: Array.from({ length: 3 }, (_, i) => ({ id: 900 + i })),
          error: null,
        });
        insertBuilder.insert = vi.fn(() => {
          matchesInsert();
          return insertBuilder;
        });
        return {
          ...list,
          insert: insertBuilder.insert,
        } as ReturnType<typeof createMockQueryBuilder>;
      },
      tournament_group_standings: () =>
        createMockQueryBuilder({ data: null, error: null }),
    });

    await runCloseGroups(supabase as never, USER_ID, TOURNAMENT_ID, {
      days: [{ date: "2026-09-01", startTime: "10:00", endTime: "14:00" }],
      matchDuration: 60,
      courtIds: [1],
    });

    expect(matchesInsert).toHaveBeenCalled();
    expect(playoffsInsert).toHaveBeenCalled();
  });
});
