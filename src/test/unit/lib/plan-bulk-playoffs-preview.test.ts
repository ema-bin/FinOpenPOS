import { describe, expect, it } from "vitest";
import {
  BulkPlayoffsPlanError,
  planBulkPlayoffsPreview,
  planSinglePlayoffsPreview,
} from "@/lib/plan-bulk-playoffs-preview";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
} from "@/test/mock-supabase-client";
import {
  PLAYOFF_PLAN_TOURNAMENT_ID,
  supabaseSingleZoneOfFour,
  supabaseTwoZonesOfFourEightTeams,
  VALID_PLAYOFF_SCHEDULE_BODY,
  wrapSupabaseForBulkPreview,
  wrapSupabaseForSinglePreview,
} from "@/test/helpers/playoff-plan-fixtures";

describe("plan-bulk-playoffs-preview (lib)", () => {
  it("BulkPlayoffsPlanError expone status HTTP", () => {
    const err = new BulkPlayoffsPlanError("falló", 400);
    expect(err.message).toBe("falló");
    expect(err.status).toBe(400);
    expect(err.name).toBe("BulkPlayoffsPlanError");
  });

  describe("planSinglePlayoffsPreview", () => {
    it("400 si la config de horarios es inválida", async () => {
      const supabase = wrapSupabaseForSinglePreview(
        supabaseSingleZoneOfFour(),
        PLAYOFF_PLAN_TOURNAMENT_ID
      );
      await expect(
        planSinglePlayoffsPreview(supabase as never, PLAYOFF_PLAN_TOURNAMENT_ID, {})
      ).rejects.toMatchObject({ status: 400 });
    });

    it("404 si el torneo no existe", async () => {
      const supabase = createMockSupabaseClient({
        tournaments: () =>
          createMockQueryBuilder({ data: null, error: { message: "missing" } }),
      });
      await expect(
        planSinglePlayoffsPreview(
          supabase as never,
          999,
          VALID_PLAYOFF_SCHEDULE_BODY
        )
      ).rejects.toMatchObject({ status: 404 });
    });

    it("400 si el torneo no está listo para playoffs", async () => {
      const supabase = wrapSupabaseForSinglePreview(
        supabaseSingleZoneOfFour(),
        PLAYOFF_PLAN_TOURNAMENT_ID,
        { status: "draft" }
      );
      await expect(
        planSinglePlayoffsPreview(
          supabase as never,
          PLAYOFF_PLAN_TOURNAMENT_ID,
          VALID_PLAYOFF_SCHEDULE_BODY
        )
      ).rejects.toMatchObject({ status: 400 });
    });

    it("400 si ya hay playoffs generados", async () => {
      const plan = supabaseSingleZoneOfFour();
      const base = plan.from as ReturnType<typeof import("vitest").vi.fn>;
      const supabase = {
        from: (table: string) => {
          if (table === "tournaments") {
            return createMockQueryBuilder({
              data: {
                id: PLAYOFF_PLAN_TOURNAMENT_ID,
                name: "Copa",
                status: "playoffs_ready",
                match_duration: 60,
                match_duration_quarters_onwards: 60,
              },
              error: null,
            });
          }
          if (table === "tournament_playoffs") {
            return createMockQueryBuilder({ data: [{ id: 1 }], error: null });
          }
          return base(table);
        },
      };

      await expect(
        planSinglePlayoffsPreview(
          supabase as never,
          PLAYOFF_PLAN_TOURNAMENT_ID,
          VALID_PLAYOFF_SCHEDULE_BODY
        )
      ).rejects.toMatchObject({ status: 400 });
    });

    it("planifica zona de 4 con horarios asignados", async () => {
      const supabase = wrapSupabaseForSinglePreview(
        supabaseSingleZoneOfFour(),
        PLAYOFF_PLAN_TOURNAMENT_ID
      );
      const result = await planSinglePlayoffsPreview(
        supabase as never,
        PLAYOFF_PLAN_TOURNAMENT_ID,
        VALID_PLAYOFF_SCHEDULE_BODY
      );

      expect(result.totalPlayoffMatches).toBeGreaterThan(0);
      expect(result.slotsUsed).toBe(result.totalPlayoffMatches);
      expect(result.tournament.matches.length).toBeGreaterThan(0);
      const scheduled = result.tournament.matches.filter(
        (m) => m.match_date && m.start_time && m.court_id
      );
      expect(scheduled.length).toBe(result.totalPlayoffMatches);
      expect(scheduled[0].team1Label).toMatch(/Equipo|1/);
    });
  });

  describe("planBulkPlayoffsPreview", () => {
    it("400 si no hay torneos playoffs_ready", async () => {
      const supabase = createMockSupabaseClient({
        tournaments: () =>
          createMockQueryBuilder({ data: [], error: null }),
      });
      await expect(
        planBulkPlayoffsPreview(supabase as never, VALID_PLAYOFF_SCHEDULE_BODY)
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/No hay torneos listos/i),
      });
    });

    it("planifica un torneo de 8 parejas (2 zonas de 4)", async () => {
      const plan = supabaseTwoZonesOfFourEightTeams();
      const supabase = wrapSupabaseForBulkPreview(plan, [
        { id: PLAYOFF_PLAN_TOURNAMENT_ID, name: "Octavos Cup" },
      ]);

      const result = await planBulkPlayoffsPreview(
        supabase as never,
        VALID_PLAYOFF_SCHEDULE_BODY
      );

      expect(result.tournaments).toHaveLength(1);
      expect(result.totalPlayoffMatches).toBeGreaterThan(0);
      expect(result.slotsUsed).toBe(result.totalPlayoffMatches);
      const withSchedule = result.tournaments[0].matches.filter(
        (m) => m.court_id && m.start_time
      );
      expect(withSchedule.length).toBeGreaterThan(0);
    });
  });
});
