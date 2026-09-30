import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tournaments/[id]/mark-playoffs-ready/route";
import {
  createMockQueryBuilder,
  createMockQueryBuilderChainable,
} from "@/test/mock-supabase-client";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

const TOURNAMENT_ID = 55;

function authedFrom(handlers: Record<string, () => ReturnType<typeof createMockQueryBuilder>>) {
  return vi.fn((table: string) => {
    const handler = handlers[table];
    if (!handler) throw new Error(`tabla no mock: ${table}`);
    return handler();
  });
}

describe("POST /api/tournaments/[id]/mark-playoffs-ready (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const res = await POST(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
    expect(res.status).toBe(401);
  });

  it("400 si el id no es entero", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    } as never);

    const res = await POST(new Request("http://x"), { params: { id: "12.5" } });
    expect(res.status).toBe(400);
  });

  it("404 si el torneo no existe", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: authedFrom({
        tournaments: () =>
          createMockQueryBuilder({ data: null, error: { message: "missing" } }),
      }),
    } as never);

    const res = await POST(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
    expect(res.status).toBe(404);
  });

  it("400 si el torneo no está in_progress", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: authedFrom({
        tournaments: () =>
          createMockQueryBuilder({
            data: { id: TOURNAMENT_ID, status: "playoffs_ready" },
            error: null,
          }),
      }),
    } as never);

    const res = await POST(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/en progreso/i);
  });

  it("400 si faltan resultados en partidos de zona", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: authedFrom({
        tournaments: () =>
          createMockQueryBuilder({
            data: { id: TOURNAMENT_ID, status: "in_progress" },
            error: null,
          }),
        tournament_groups: () =>
          createMockQueryBuilderChainable({ data: [{ id: 1 }], error: null }),
        tournament_playoffs: () =>
          createMockQueryBuilderChainable({ data: [], error: null }),
        tournament_matches: () =>
          createMockQueryBuilderChainable({
            data: [
              { id: 1, set1_team1_games: 6, set1_team2_games: 4 },
              { id: 2, set1_team1_games: null, set1_team2_games: null },
            ],
            error: null,
          }),
      }),
    } as never);

    const res = await POST(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Faltan 1 partido/i);
  });

  it("200 marca playoffs_ready cuando todo está completo", async () => {
    const updateBuilder = createMockQueryBuilder({ data: null, error: null });
    let tournamentsCalls = 0;

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tournaments") {
          tournamentsCalls += 1;
          if (tournamentsCalls === 1) {
            return createMockQueryBuilder({
              data: { id: TOURNAMENT_ID, status: "in_progress" },
              error: null,
            });
          }
          return updateBuilder;
        }
        if (table === "tournament_groups") {
          return createMockQueryBuilderChainable({ data: [{ id: 1 }], error: null });
        }
        if (table === "tournament_playoffs") {
          return createMockQueryBuilderChainable({ data: [], error: null });
        }
        if (table === "tournament_matches") {
          return createMockQueryBuilderChainable({
            data: [{ id: 1, set1_team1_games: 6, set1_team2_games: 3 }],
            error: null,
          });
        }
        throw new Error(`tabla no mock: ${table}`);
      }),
    } as never);

    const res = await POST(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(updateBuilder.update).toHaveBeenCalled();
  });
});
