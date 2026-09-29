import { describe, expect, it } from "vitest";
import {
  buildGlobalRanking,
  calculateFirstRound,
  generatePlayoffBracket,
  generatePlayoffs,
  type QualifiedTeam,
} from "@/lib/tournament-playoffs";
import { PREDEFINED_FIRST_ROUND_BRACKETS } from "@/lib/playoff-first-round-brackets";

function label(t: QualifiedTeam): string {
  return `${t.pos}${String.fromCharCode(64 + t.group_order)}`;
}

/** Arma clasificados y mapa de orden de zona a partir de etiquetas tipo 1A, 2B. */
function buildQualified(
  entries: Array<{ slot: string; teamId: number; groupId: number }>
): {
  qualified: Array<{ team_id: number; from_group_id: number; pos: number }>;
  groupOrderMap: Map<number, number>;
} {
  const groupOrderMap = new Map<number, number>();
  const qualified = entries.map(({ slot, teamId, groupId }) => {
    const m = slot.match(/^([123])([A-Z])$/i);
    if (!m) throw new Error(`slot inválido: ${slot}`);
    const pos = parseInt(m[1], 10);
    const group_order = m[2].toUpperCase().charCodeAt(0) - 64;
    groupOrderMap.set(groupId, group_order);
    return { team_id: teamId, from_group_id: groupId, pos };
  });
  return { qualified, groupOrderMap };
}

function firstRoundMatches(
  matches: ReturnType<typeof generatePlayoffs>,
  roundName: string
) {
  return matches.filter((m) => m.round === roundName);
}

describe("buildGlobalRanking (lib)", () => {
  it("ordena 1ros A→Z, 2dos Z→A, 3ros A→Z", () => {
    const input: QualifiedTeam[] = [
      { team_id: 301, from_group_id: 103, pos: 3, group_order: 3 },
      { team_id: 203, from_group_id: 103, pos: 2, group_order: 3 },
      { team_id: 201, from_group_id: 102, pos: 2, group_order: 2 },
      { team_id: 101, from_group_id: 101, pos: 1, group_order: 1 },
      { team_id: 102, from_group_id: 102, pos: 1, group_order: 2 },
      { team_id: 103, from_group_id: 103, pos: 1, group_order: 3 },
      { team_id: 202, from_group_id: 101, pos: 2, group_order: 1 },
    ];

    const ranked = buildGlobalRanking(input);
    expect(ranked.map(label)).toEqual(["1A", "1B", "1C", "2C", "2B", "2A", "3C"]);
  });
});

describe("tournament-playoffs (lib)", () => {
  it("calculateFirstRound para 8 clasificados", () => {
    const r = calculateFirstRound(8);
    expect(r.teamsPlaying).toBe(8);
    expect(r.teamsWithBye).toBe(0);
    expect(r.nextRoundSize).toBe(4);
    expect(r.firstRoundName).toBe("cuartos");
  });

  it("calculateFirstRound asigna byes cuando corresponde", () => {
    const r = calculateFirstRound(12);
    expect(r.teamsPlaying + r.teamsWithBye).toBe(12);
    expect(r.teamsPlaying % 2).toBe(0);
    expect(r.nextRoundSize).toBeGreaterThanOrEqual(4);
  });
});

describe("playoff-first-round-brackets (lib)", () => {
  it("coincide con plantillas documentadas para 8, 10 y 12 parejas", () => {
    expect(PREDEFINED_FIRST_ROUND_BRACKETS[8]).toEqual([
      { team1: "1A", team2: null },
      { team1: "2B", team2: "3A" },
      { team1: "1B", team2: null },
      { team1: "2A", team2: "3B" },
    ]);
    expect(PREDEFINED_FIRST_ROUND_BRACKETS[10]).toEqual([
      { team1: "1A", team2: null },
      { team1: "2B", team2: "2C" },
      { team1: "1B", team2: "3A" },
      { team1: "1C", team2: "2A" },
    ]);
    expect(PREDEFINED_FIRST_ROUND_BRACKETS[12]).toEqual([
      { team1: "1A", team2: "2B" },
      { team1: "1D", team2: "2C" },
      { team1: "1B", team2: "2A" },
      { team1: "1C", team2: "2D" },
    ]);
  });
});

describe("generatePlayoffs / generatePlayoffBracket (lib)", () => {
  it("torneo 8 parejas: byes en 1A y 1B y cruces prefijados", () => {
    const { qualified, groupOrderMap } = buildQualified([
      { slot: "1A", teamId: 11, groupId: 201 },
      { slot: "2A", teamId: 12, groupId: 201 },
      { slot: "3A", teamId: 13, groupId: 201 },
      { slot: "1B", teamId: 21, groupId: 202 },
      { slot: "2B", teamId: 22, groupId: 202 },
      { slot: "3B", teamId: 23, groupId: 202 },
    ]);

    const matches = generatePlayoffs(qualified, groupOrderMap, 8);
    const { firstRoundName } = calculateFirstRound(qualified.length);
    const first = firstRoundMatches(matches, firstRoundName);

    expect(first).toHaveLength(4);
    expect(first[0]).toMatchObject({ bracket_pos: 1, team1_id: 11, team2_id: null });
    expect(first[1]).toMatchObject({ bracket_pos: 2, team1_id: 22, team2_id: 13 });
    expect(first[2]).toMatchObject({ bracket_pos: 3, team1_id: 21, team2_id: null });
    expect(first[3]).toMatchObject({ bracket_pos: 4, team1_id: 12, team2_id: 23 });
  });

  it("torneo 10 parejas: plantilla con play-in y sin rival en 1A", () => {
    const { qualified, groupOrderMap } = buildQualified([
      { slot: "1A", teamId: 1, groupId: 301 },
      { slot: "1B", teamId: 2, groupId: 302 },
      { slot: "1C", teamId: 3, groupId: 303 },
      { slot: "2A", teamId: 4, groupId: 301 },
      { slot: "2B", teamId: 5, groupId: 302 },
      { slot: "2C", teamId: 6, groupId: 303 },
      { slot: "3A", teamId: 7, groupId: 301 },
    ]);

    const matches = generatePlayoffs(qualified, groupOrderMap, 10);
    const { firstRoundName } = calculateFirstRound(qualified.length);
    const first = firstRoundMatches(matches, firstRoundName);

    expect(first).toHaveLength(4);
    expect(first[0].team1_id).toBe(1);
    expect(first[0].team2_id).toBeNull();
    expect(first[1]).toMatchObject({ team1_id: 5, team2_id: 6 });
    expect(first[2]).toMatchObject({ team1_id: 2, team2_id: 7 });
    expect(first[3]).toMatchObject({ team1_id: 3, team2_id: 4 });
  });

  it("torneo 12 parejas: cuartos directos sin byes en 1ª ronda", () => {
    const { qualified, groupOrderMap } = buildQualified([
      { slot: "1A", teamId: 101, groupId: 401 },
      { slot: "2A", teamId: 102, groupId: 401 },
      { slot: "1B", teamId: 103, groupId: 402 },
      { slot: "2B", teamId: 104, groupId: 402 },
      { slot: "1C", teamId: 105, groupId: 403 },
      { slot: "2C", teamId: 106, groupId: 403 },
      { slot: "1D", teamId: 107, groupId: 404 },
      { slot: "2D", teamId: 108, groupId: 404 },
    ]);

    const matches = generatePlayoffs(qualified, groupOrderMap, 12);
    const { firstRoundName } = calculateFirstRound(qualified.length);
    const first = firstRoundMatches(matches, firstRoundName);

    expect(first).toHaveLength(4);
    expect(first.every((m) => m.team1_id != null && m.team2_id != null)).toBe(true);
    expect(first[0]).toMatchObject({ team1_id: 101, team2_id: 104 });
    expect(first[1]).toMatchObject({ team1_id: 107, team2_id: 106 });
    expect(first[2]).toMatchObject({ team1_id: 103, team2_id: 102 });
    expect(first[3]).toMatchObject({ team1_id: 105, team2_id: 108 });
  });

  it("genera semifinal y final después de cuartos (8 clasificados sin plantilla)", () => {
    const ranked: QualifiedTeam[] = Array.from({ length: 8 }, (_, i) => ({
      team_id: 1000 + i,
      from_group_id: 500 + i,
      pos: i < 4 ? 1 : 2,
      group_order: (i % 4) + 1,
    }));
    ranked.sort((a, b) => a.group_order - b.group_order);
    const ordered = buildGlobalRanking(ranked);

    const matches = generatePlayoffBracket(ordered);
    const rounds = [...new Set(matches.map((m) => m.round))];

    expect(rounds).toContain("cuartos");
    expect(rounds).toContain("semifinal");
    expect(rounds).toContain("final");
    expect(matches.filter((m) => m.round === "cuartos")).toHaveLength(4);
  });
});
