import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/tournaments/playoffs-ready/summary/route";
import {
  supabaseTwoZonesOfFourEightTeams,
  wrapSupabaseForBulkPreview,
} from "@/test/helpers/playoff-plan-fixtures";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/tournaments/playoffs-ready/summary (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("resume partidos de playoff necesarios por torneo", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    const client = wrapSupabaseForBulkPreview(plan, [
      { id: 10, name: "Open" },
    ]);
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: client.from,
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tournamentCount).toBe(1);
    expect(json.totalPlayoffMatches).toBeGreaterThan(0);
    expect(json.tournaments[0]).toMatchObject({
      id: 10,
      name: "Open",
      playoffMatches: json.totalPlayoffMatches,
    });
  });
});
