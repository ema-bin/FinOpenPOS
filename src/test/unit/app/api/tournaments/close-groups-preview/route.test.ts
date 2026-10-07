import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tournaments/[id]/close-groups/preview/route";
import { BulkPlayoffsPlanError } from "@/lib/plan-bulk-playoffs-preview";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/plan-bulk-playoffs-preview", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/plan-bulk-playoffs-preview")
  >();
  return {
    ...actual,
    planSinglePlayoffsPreview: vi.fn(),
  };
});

import { createClient } from "@/lib/supabase/server";
import { planSinglePlayoffsPreview } from "@/lib/plan-bulk-playoffs-preview";

const TOURNAMENT_ID = 33;

describe("POST /api/tournaments/[id]/close-groups/preview (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const res = await POST(
      new Request("http://x", { method: "POST", body: "{}" }),
      { params: { id: String(TOURNAMENT_ID) } }
    );
    expect(res.status).toBe(401);
  });

  it("400 si el id no es numérico", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    } as never);

    const res = await POST(
      new Request("http://x", { method: "POST", body: "{}" }),
      { params: { id: "bad" } }
    );
    expect(res.status).toBe(400);
  });

  it("propaga BulkPlayoffsPlanError", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    } as never);
    vi.mocked(planSinglePlayoffsPreview).mockRejectedValue(
      new BulkPlayoffsPlanError("Sin horarios", 400)
    );

    const res = await POST(
      new Request("http://x", { method: "POST", body: "{}" }),
      { params: { id: String(TOURNAMENT_ID) } }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Sin horarios");
  });

  it("200 con preview de cierre de zonas", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    } as never);
    vi.mocked(planSinglePlayoffsPreview).mockResolvedValue({
      tournament: {
        id: TOURNAMENT_ID,
        name: "Copa",
        match_duration: 60,
        match_duration_quarters_onwards: 60,
        matches: [],
      },
      totalPlayoffMatches: 5,
      slotsUsed: 5,
    });

    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ courtIds: [1] }) }),
      { params: { id: String(TOURNAMENT_ID) } }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalPlayoffMatches).toBe(5);
    expect(planSinglePlayoffsPreview).toHaveBeenCalledWith(
      expect.anything(),
      TOURNAMENT_ID,
      expect.objectContaining({ courtIds: [1] })
    );
  });
});
