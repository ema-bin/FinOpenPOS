import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/whatsapp-message-templates/route";
import { DELETE, PATCH } from "@/app/api/whatsapp-message-templates/[id]/route";

vi.mock("@/lib/repository-factory", () => ({
  createRepositories: vi.fn(),
}));

import { createRepositories } from "@/lib/repository-factory";

function mockRepo(repo: Record<string, unknown>) {
  vi.mocked(createRepositories).mockResolvedValue({
    whatsappMessageTemplates: repo,
  } as never);
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, { method, body: JSON.stringify(body) });
}

const template = {
  id: 1,
  kind: "tournament_invite",
  name: "Corto",
  body: "Hola {nombre}",
  created_at: "2026-10-07T00:00:00Z",
  updated_at: "2026-10-07T00:00:00Z",
};

describe("/api/whatsapp-message-templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET 400 con kind inválido", async () => {
    const res = await GET(new Request("http://localhost/api/whatsapp-message-templates?kind=x"));
    expect(res.status).toBe(400);
    expect(createRepositories).not.toHaveBeenCalled();
  });

  it("GET lista variantes por kind", async () => {
    const findByKind = vi.fn().mockResolvedValue([template]);
    mockRepo({ findByKind });

    const res = await GET(
      new Request("http://localhost/api/whatsapp-message-templates?kind=tournament_invite")
    );

    expect(res.status).toBe(200);
    expect(findByKind).toHaveBeenCalledWith("tournament_invite");
    expect(await res.json()).toEqual([template]);
  });

  it("GET 401 si no hay usuario", async () => {
    vi.mocked(createRepositories).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(
      new Request("http://localhost/api/whatsapp-message-templates?kind=debt_reminder")
    );
    expect(res.status).toBe(401);
  });

  it("POST crea con nombre y mensaje recortados", async () => {
    const create = vi.fn().mockResolvedValue(template);
    mockRepo({ create });

    const res = await POST(
      jsonRequest("http://localhost/api/whatsapp-message-templates", "POST", {
        kind: "tournament_invite",
        name: " Corto ",
        body: " Hola {nombre} ",
      })
    );

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      kind: "tournament_invite",
      name: "Corto",
      body: "Hola {nombre}",
    });
  });

  it("POST 400 sin mensaje", async () => {
    mockRepo({ create: vi.fn() });
    const res = await POST(
      jsonRequest("http://localhost/api/whatsapp-message-templates", "POST", {
        kind: "tournament_invite",
        name: "Corto",
      })
    );
    expect(res.status).toBe(400);
  });

  it("PATCH actualiza el body", async () => {
    const update = vi.fn().mockResolvedValue({ ...template, body: "Nuevo" });
    mockRepo({ update });

    const res = await PATCH(
      jsonRequest("http://localhost/api/whatsapp-message-templates/1", "PATCH", { body: "Nuevo" }),
      { params: { id: "1" } }
    );

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(1, { body: "Nuevo" });
  });

  it("PATCH 404 si no existe", async () => {
    mockRepo({ update: vi.fn().mockResolvedValue(null) });
    const res = await PATCH(
      jsonRequest("http://localhost/api/whatsapp-message-templates/9", "PATCH", { name: "X" }),
      { params: { id: "9" } }
    );
    expect(res.status).toBe(404);
  });

  it("PATCH 400 con id inválido", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/whatsapp-message-templates/abc", "PATCH", { name: "X" }),
      { params: { id: "abc" } }
    );
    expect(res.status).toBe(400);
  });

  it("DELETE elimina y responde 204", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    mockRepo({ delete: del });

    const res = await DELETE(new Request("http://localhost/api/whatsapp-message-templates/1"), {
      params: { id: "1" },
    });

    expect(res.status).toBe(204);
    expect(del).toHaveBeenCalledWith(1);
  });
});
