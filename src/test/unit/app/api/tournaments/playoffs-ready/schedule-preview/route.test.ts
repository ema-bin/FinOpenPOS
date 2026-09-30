import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/tournaments/playoffs-ready/schedule-preview/route";
import { createMockQueryBuilder, createMockSupabaseClient } from "@/test/mock-supabase-client";

vi.mock("@/lib/repository-factory", () => ({
  createRepositories: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createRepositories } from "@/lib/repository-factory";
import { createClient } from "@/lib/supabase/server";

describe("GET /api/tournaments/playoffs-ready/schedule-preview (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve lista vacía si no hay ids ni playoffs en DB", async () => {
    vi.mocked(createClient).mockReturnValue(
      createMockSupabaseClient({
        tournament_playoffs: () =>
          createMockQueryBuilder({ data: [], error: null }),
      }) as never
    );

    const res = await GET(
      new Request("http://localhost/api/tournaments/playoffs-ready/schedule-preview")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournaments: [] });
  });

  it("carga torneo y filas de playoff por ids en query", async () => {
    const findById = vi.fn().mockResolvedValue({
      id: 5,
      name: "Copa",
      status: "in_progress",
      match_duration: 60,
      match_duration_quarters_onwards: 60,
    });
    const findByTournamentId = vi.fn().mockResolvedValue([
      { id: 100, round: "cuartos", bracket_pos: 1 },
    ]);
    vi.mocked(createRepositories).mockResolvedValue({
      tournaments: { findById },
      tournamentPlayoffs: { findByTournamentId },
    } as never);

    const res = await GET(
      new Request(
        "http://localhost/api/tournaments/playoffs-ready/schedule-preview?ids=5,invalid"
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tournaments).toHaveLength(1);
    expect(json.tournaments[0].rows).toHaveLength(1);
    expect(findById).toHaveBeenCalledWith(5);
  });
});
