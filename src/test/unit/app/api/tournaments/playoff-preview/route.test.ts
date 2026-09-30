import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tournaments/[id]/playoff-preview/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  PLAYOFF_PLAN_TOURNAMENT_ID,
  supabaseTwoZonesOfFourEightTeams,
  VALID_PLAYOFF_SCHEDULE_BODY,
  wrapSupabaseForPlayoffPreviewRoute,
} from "@/test/helpers/playoff-plan-fixtures";

function authedSupabase(client: { from: (t: string) => unknown }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: client.from,
  };
}

describe("POST /api/tournaments/[id]/playoff-preview (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin usuario autenticado", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/tournaments/5/playoff-preview", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: { id: "5" } }
    );

    expect(res.status).toBe(401);
  });

  it("400 si el id no es numérico", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/tournaments/x/playoff-preview", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: { id: "not-a-number" } }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
  });

  it("preview proyectado desde inscripción (sin zonas)", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    const client = wrapSupabaseForPlayoffPreviewRoute(plan, {
      projectedFromRegistration: true,
      registeredTeams: 8,
    });
    vi.mocked(createClient).mockReturnValue(authedSupabase(client) as never);

    const res = await POST(
      new Request("http://localhost/api/tournaments/8/playoff-preview", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: { id: "8" } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projectedFromRegistration).toBe(true);
    expect(json.placeholdersUsed).toBe(true);
    expect(json.matches.length).toBeGreaterThan(0);
    expect(json.matches.some((m: { display_team1?: string }) => m.display_team1 === "1A")).toBe(
      true
    );
  });

  it("preview desde standings con zonas cerradas", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    const client = wrapSupabaseForPlayoffPreviewRoute(plan);
    vi.mocked(createClient).mockReturnValue(authedSupabase(client) as never);

    const res = await POST(
      new Request(
        `http://localhost/api/tournaments/${PLAYOFF_PLAN_TOURNAMENT_ID}/playoff-preview`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      ),
      { params: { id: String(PLAYOFF_PLAN_TOURNAMENT_ID) } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projectedFromRegistration).toBe(false);
    expect(json.placeholdersUsed).toBe(false);
    expect(json.matches.length).toBeGreaterThan(0);
  });

  it("asigna slots cuando se envía grilla de horarios", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    const client = wrapSupabaseForPlayoffPreviewRoute(plan);
    vi.mocked(createClient).mockReturnValue(authedSupabase(client) as never);

    const res = await POST(
      new Request(
        `http://localhost/api/tournaments/${PLAYOFF_PLAN_TOURNAMENT_ID}/playoff-preview`,
        {
          method: "POST",
          body: JSON.stringify(VALID_PLAYOFF_SCHEDULE_BODY),
        }
      ),
      { params: { id: String(PLAYOFF_PLAN_TOURNAMENT_ID) } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.slotsNeeded).toBeGreaterThan(0);
    expect(json.slotsAvailable).toBeGreaterThanOrEqual(json.slotsNeeded);
    const scheduled = json.matches.filter(
      (m: { start_time?: string | null }) => m.start_time != null
    );
    expect(scheduled.length).toBe(json.slotsNeeded);
  });

  it("400 si hay menos de 3 equipos inscriptos en preview proyectado", async () => {
    const plan = supabaseTwoZonesOfFourEightTeams();
    const client = wrapSupabaseForPlayoffPreviewRoute(plan, {
      projectedFromRegistration: true,
      registeredTeams: 2,
    });
    vi.mocked(createClient).mockReturnValue(authedSupabase(client) as never);

    const res = await POST(
      new Request("http://localhost/api/tournaments/2/playoff-preview", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: { id: "2" } }
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/3 equipos/i);
  });
});
