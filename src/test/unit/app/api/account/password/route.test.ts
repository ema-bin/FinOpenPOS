import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account/password/route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

function mockAuth(auth: Record<string, unknown>) {
  vi.mocked(createClient).mockReturnValue({ auth } as never);
}

function request(body: unknown) {
  return new Request("http://localhost/api/account/password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    mockAuth({ getUser: vi.fn().mockResolvedValue({ data: { user: null } }) });
    const res = await POST(request({ currentPassword: "actual1", newPassword: "nueva12" }));
    expect(res.status).toBe(401);
  });

  it("400 si la contraseña actual no coincide y no la cambia", async () => {
    const updateUser = vi.fn();
    mockAuth({
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: "a@x.com" } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "Invalid login" } }),
      updateUser,
    });

    const res = await POST(request({ currentPassword: "mal", newPassword: "nueva12" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "La contraseña actual no es correcta" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("cambia la contraseña del usuario logueado", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    mockAuth({
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: "a@x.com" } } }),
      signInWithPassword,
      updateUser,
    });

    const res = await POST(request({ currentPassword: "actual1", newPassword: "nueva12" }));

    expect(res.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@x.com", password: "actual1" });
    expect(updateUser).toHaveBeenCalledWith({ password: "nueva12" });
  });
});