import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tournaments/playoffs-ready/preview/route";
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
    planBulkPlayoffsPreview: vi.fn(),
  };
});

import { createClient } from "@/lib/supabase/server";
import { planBulkPlayoffsPreview } from "@/lib/plan-bulk-playoffs-preview";

describe("POST /api/tournaments/playoffs-ready/preview (api)", () => {
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
      new Request("http://localhost/api/tournaments/playoffs-ready/preview", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(401);
  });

  it("propaga BulkPlayoffsPlanError como JSON con status", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
    } as never);
    vi.mocked(planBulkPlayoffsPreview).mockRejectedValue(
      new BulkPlayoffsPlanError("Grilla insuficiente", 400)
    );

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/preview", {
        method: "POST",
        body: JSON.stringify({ days: [] }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Grilla insuficiente");
  });

  it("200 con preview del planificador", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
    } as never);
    vi.mocked(planBulkPlayoffsPreview).mockResolvedValue({
      tournaments: [],
      totalPlayoffMatches: 3,
      slotsUsed: 3,
    });

    const res = await POST(
      new Request("http://localhost/api/tournaments/playoffs-ready/preview", {
        method: "POST",
        body: JSON.stringify({ courtIds: [1] }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalPlayoffMatches).toBe(3);
  });
});
