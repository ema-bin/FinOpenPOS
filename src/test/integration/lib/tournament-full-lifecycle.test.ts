import { describe, expect, it } from "vitest";
import { computeGroupSizes } from "@/lib/tournament-group-sizes";
import {
  buildSimulatedTournamentFixture,
  computePlayoffsAfterGroupPhase,
  computeRegistrationPlayoffPreview,
  normalizePlayoffBracket,
  normalizePlayoffPreviewFirstRound,
  firstRoundNormalizedSlots,
  teamLabelFromQualified,
} from "@/test/helpers/tournament-lifecycle-fixture";

/** Todos los formatos habituales de torneo (8 a 30 parejas inscriptas). */
const TEAM_COUNTS = Array.from({ length: 23 }, (_, i) => i + 8);

describe("torneo — ciclo completo (integración lib)", () => {
  it.each(TEAM_COUNTS)(
    "%i parejas: zonas coherentes con computeGroupSizes",
    (count) => {
      const fixture = buildSimulatedTournamentFixture(count);
      expect(fixture.groupSizes).toEqual(computeGroupSizes(count));
      expect(fixture.groupTeams.length).toBe(count);
      expect(fixture.groupSizes.reduce((a, b) => a + b, 0)).toBe(count);
      expect(fixture.groups.length).toBe(fixture.groupSizes.length);

      for (let i = 0; i < fixture.groupSizes.length; i++) {
        const size = fixture.groupSizes[i];
        expect(size === 3 || size === 4).toBe(true);
        const groupId = i + 1;
        const teamsInGroup = fixture.groupTeams.filter(
          (gt) => gt.tournament_group_id === groupId
        );
        expect(teamsInGroup).toHaveLength(size);
        const finishedInGroup = fixture.matches.filter(
          (m) => m.tournament_group_id === groupId && m.status === "finished"
        );
        expect(finishedInGroup.length).toBe(size === 4 ? 4 : 3);
      }
    }
  );

  it.each(TEAM_COUNTS)(
    "%i parejas: preview post-zona y cierre de grupos producen el mismo cuadro",
    (count) => {
      const fixture = buildSimulatedTournamentFixture(count);
      const previewPath = computePlayoffsAfterGroupPhase(fixture);
      const closeGroupsPath = computePlayoffsAfterGroupPhase(fixture);

      expect(previewPath.qualified).toEqual(closeGroupsPath.qualified);
      expect(normalizePlayoffBracket(previewPath.matches, new Map())).toEqual(
        normalizePlayoffBracket(closeGroupsPath.matches, new Map())
      );
    }
  );

  it.each(TEAM_COUNTS)(
    "%i parejas: tras simular resultados, cuadro por etiquetas coincide con preview desde inscripción",
    (count) => {
      const fixture = buildSimulatedTournamentFixture(count);
      const afterSim = computePlayoffsAfterGroupPhase(fixture);
      const fromRegistration = computeRegistrationPlayoffPreview(count);

      const realLabels = teamLabelFromQualified(
        afterSim.qualified,
        afterSim.groupOrderMap
      );
      const simNormalized = normalizePlayoffBracket(
        afterSim.matches,
        realLabels
      );

      const projectedLabels = fromRegistration.placeholderMap;
      const projectedNormalized = normalizePlayoffBracket(
        fromRegistration.matches,
        projectedLabels
      );

      expect(simNormalized).toEqual(projectedNormalized);
    }
  );

  it.each(TEAM_COUNTS)(
    "%i parejas: 1ª ronda del preview con placeholders coincide con etiquetas reales tras simular",
    (count) => {
      const fixture = buildSimulatedTournamentFixture(count);
      const afterSim = computePlayoffsAfterGroupPhase(fixture);
      const fromRegistration = computeRegistrationPlayoffPreview(count);

      const realLabels = teamLabelFromQualified(
        afterSim.qualified,
        afterSim.groupOrderMap
      );
      const simFirstRound = firstRoundNormalizedSlots(
        afterSim.matches,
        realLabels
      );

      const previewFirstRound = normalizePlayoffPreviewFirstRound(
        fromRegistration.matches,
        fromRegistration.placeholderMap
      );

      expect(previewFirstRound).toEqual(simFirstRound);
    }
  );
});
