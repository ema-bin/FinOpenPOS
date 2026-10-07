import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/tournaments/playoffs-ready/group-slots/route";
import {
  PLAYOFF_PLAN_TOURNAMENT_ID,
  supabaseTwoZonesOfFourEightTeams,
  wrapSupabaseForGroupSlotsRoute,
} from "@/test/helpers/playoff-plan-fixtures";
import { createMockQueryBuilderChainable, createMockSupabaseClient } from "@/test/mock-supabase-client";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/tournaments/playoffs-ready/group-slots (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lista vacía si no hay torneos playoffs_ready", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      },
      from: createMockSupabaseClient({
        tournaments: () =>
          createMockQueryBuilderChainable({ data: [], error: null }),
      }).from,
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slots: [], totalPlayoffMatches: 0 });
  });

  it("enriquece slots y suma partidos de playoff necesarios", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    const client = wrapSupabaseForGroupSlotsRoute(plan, {
      tournaments: [{ id: PLAYOFF_PLAN_TOURNAMENT_ID, name: "  Copa  " }],
      slots: [
        {
          id: 900,
          tournament_id: PLAYOFF_PLAN_TOURNAMENT_ID,
          slot_date: "2026-09-01",
          start_time: "10:00:00",
          end_time: "11:00:00",
        },
      ],
    });

    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      },
      from: client.from,
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.slots).toHaveLength(1);
    expect(json.slots[0].tournament_name).toBe("Copa");
    expect(json.totalPlayoffMatches).toBeGreaterThan(0);
  });
});
