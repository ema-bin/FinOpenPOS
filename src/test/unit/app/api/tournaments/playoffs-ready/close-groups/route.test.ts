import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tournaments/playoffs-ready/close-groups/route";
import {
  supabaseTwoZonesOfFourEightTeams,
  TINY_PLAYOFF_SCHEDULE_BODY,
  VALID_PLAYOFF_SCHEDULE_BODY,
  wrapSupabaseForBulkPreview,
} from "@/test/helpers/playoff-plan-fixtures";
import { createMockQueryBuilder, createMockSupabaseClient } from "@/test/mock-supabase-client";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/execute-close-groups", () => ({
  runCloseGroups: vi.fn(),
  CloseGroupsError: class CloseGroupsError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
      this.name = "CloseGroupsError";
    }
  },
}));

import { createClient } from "@/lib/supabase/server";
import { runCloseGroups } from "@/lib/execute-close-groups";

function authedClient(client: { from: (t: string) => unknown }) {
  return {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }),
    },
  };
}

describe("POST /api/tournaments/playoffs-ready/close-groups (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/close-groups", {
        method: "POST",
        body: JSON.stringify(VALID_PLAYOFF_SCHEDULE_BODY),
      })
    );
    expect(res.status).toBe(401);
  });

  it("400 si la config de horarios es inválida", async () => {
    vi.mocked(createClient).mockReturnValue(
      authedClient(createMockSupabaseClient({})) as never
    );

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/close-groups", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/horarios inválida/i);
  });

  it("400 si no hay torneos playoffs_ready", async () => {
    vi.mocked(createClient).mockReturnValue(
      authedClient(
        createMockSupabaseClient({
          tournaments: () =>
            createMockQueryBuilder({ data: [], error: null }),
        })
      ) as never
    );

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/close-groups", {
        method: "POST",
        body: JSON.stringify(VALID_PLAYOFF_SCHEDULE_BODY),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No hay torneos listos/i);
  });

  it("400 si faltan slots para todos los partidos", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    vi.mocked(createClient).mockReturnValue(
      authedClient(wrapSupabaseForBulkPreview(plan, [{ id: 1, name: "Copa" }])) as never
    );

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/close-groups", {
        method: "POST",
        body: JSON.stringify(TINY_PLAYOFF_SCHEDULE_BODY),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/suficientes slots/i);
  });

  it("200 y ejecuta runCloseGroups por torneo", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    vi.mocked(createClient).mockReturnValue(
      authedClient(
        wrapSupabaseForBulkPreview(plan, [{ id: 42, name: "Copa Final" }])
      ) as never
    );
    vi.mocked(runCloseGroups).mockResolvedValue(undefined);

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/close-groups", {
        method: "POST",
        body: JSON.stringify(VALID_PLAYOFF_SCHEDULE_BODY),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.tournamentsProcessed).toBe(1);
    expect(runCloseGroups).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      42,
      expect.objectContaining({ explicitPlayoffSlots: expect.any(Array) })
    );
  });
});
