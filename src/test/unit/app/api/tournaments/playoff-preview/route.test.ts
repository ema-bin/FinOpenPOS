import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tournaments/[id]/playoff-preview/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

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
});
