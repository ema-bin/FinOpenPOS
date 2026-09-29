import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/tournaments/route";

vi.mock("@/lib/repository-factory", () => ({
  createRepositories: vi.fn(),
}));

import { createRepositories } from "@/lib/repository-factory";

describe("GET/POST /api/tournaments (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET filtra status válidos y descarta desconocidos", async () => {
    const findAll = vi.fn().mockResolvedValue([]);
    vi.mocked(createRepositories).mockResolvedValue({
      tournaments: { findAll },
    } as never);

    const req = new NextRequest(
      "http://localhost/api/tournaments?status=draft,invalid,in_progress"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(findAll).toHaveBeenCalledWith(["draft", "in_progress"]);
  });

  it("POST 400 si falta nombre", async () => {
    vi.mocked(createRepositories).mockResolvedValue({
      tournaments: { create: vi.fn() },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/tournaments", {
        method: "POST",
        body: JSON.stringify({ name: "   " }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/name/i);
  });
});
