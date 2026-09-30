import { describe, expect, it } from "vitest";
import { scheduleGroupMatchesWithRestrictions } from "@/lib/tournament-scheduler-with-restrictions";
import {
  assertSuccessfulSchedule,
  buildMatchesForActiveTeams,
  buildTeamCannotPlayMap,
  buildTournamentSlotGrid,
  groupOfThreeMatches,
  runTournamentSlotSchedule,
} from "@/test/helpers/scheduler-restrictions-scenarios";

const TEAM_COUNTS = Array.from({ length: 23 }, (_, i) => i + 8);

describe.sequential("scheduleGroupMatchesWithRestrictions — matriz de torneos", () => {
  it.each(TEAM_COUNTS)(
    "%i parejas, sin restricciones can_play: asigna todo con descanso y sin fallback",
    async (count) => {
      const { result, logs, health } = await runTournamentSlotSchedule({
        activeTeamCount: count,
        strictness: "none",
        allowFallback: false,
      });
      assertSuccessfulSchedule(result, logs, health);
    }
  );

  it.each(TEAM_COUNTS)(
    "%i parejas, restricciones moderadas (~20%% slots bloqueados): asigna sin fallback",
    async (count) => {
      const { result, logs, health } = await runTournamentSlotSchedule({
        activeTeamCount: count,
        strictness: "moderate",
        allowFallback: false,
      });
      assertSuccessfulSchedule(result, logs, health);
    }
  );

  it.each([8, 12, 16, 20, 24, 30])(
    "%i parejas, restricciones severas: asigna (puede usar fallback) respetando descanso",
    async (count) => {
      const { result, logs, health } = await runTournamentSlotSchedule({
        activeTeamCount: count,
        strictness: "severe",
        allowFallback: true,
      });
      assertSuccessfulSchedule(result, logs, health);
    }
  );

  it("severo en una sola zona de 3: fallback y log de respaldo", async () => {
    const matches = groupOfThreeMatches(1, [1, 2, 3]);
    const logs: string[] = [];
    const tournamentSlots = buildTournamentSlotGrid({
      days: ["2026-07-01"],
      times: ["10:00", "12:00", "14:00"],
      courtIds: [1],
    });
    const slotIds = tournamentSlots.map((s) => s.id);
    const teamCannotPlay = buildTeamCannotPlayMap([1, 2, 3], slotIds, "extreme");

    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [],
      60,
      [1],
      undefined,
      undefined,
      (msg) => logs.push(msg),
      tournamentSlots,
      teamCannotPlay
    );

    expect(result.success).toBe(true);
    expect(result.assignments).toHaveLength(3);
    expect(logs.some((l) => /respald/i.test(l))).toBe(true);
  });

  it("falla si hay menos slots físicos que partidos aunque can_play sea laxo", async () => {
    const matches = groupOfThreeMatches(1, [1, 2, 3]);
    const tournamentSlots = buildTournamentSlotGrid({
      days: ["2026-07-01"],
      times: ["10:00", "12:00"],
      courtIds: [1],
    });
    const teamCannotPlay = buildTeamCannotPlayMap([1, 2, 3], [1, 2], "none");

    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [],
      60,
      [1],
      undefined,
      undefined,
      undefined,
      tournamentSlots,
      teamCannotPlay
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/suficientes slots/i);
  });

  it("moderado en torneo pequeño: ningún partido usa slot prohibido para algún jugador", async () => {
    const { matches, teamIds } = buildMatchesForActiveTeams(9);
    const tournamentSlots = buildTournamentSlotGrid({
      days: ["2026-07-01", "2026-07-02", "2026-07-03"],
      courtIds: [1, 2],
    });
    const slotIds = tournamentSlots.map((s) => s.id);
    const teamCannotPlay = buildTeamCannotPlayMap(teamIds, slotIds, "moderate");
    const logs: string[] = [];

    const result = await scheduleGroupMatchesWithRestrictions(
      matches,
      [],
      60,
      [1, 2],
      undefined,
      undefined,
      (msg) => logs.push(msg),
      tournamentSlots,
      teamCannotPlay
    );

    assertSuccessfulSchedule(result, logs, {
      matches,
      teamIds,
      tournamentSlots,
      teamCannotPlay,
      allowFallback: false,
    });
  });
});
