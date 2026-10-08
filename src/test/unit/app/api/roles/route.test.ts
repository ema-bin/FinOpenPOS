import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/roles/route";
import { DELETE, PATCH } from "@/app/api/roles/[id]/route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/auth/load-role-permissions", () => ({ loadRolePermissions: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";

function asAdmin() {
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin" } } }) },
  } as never);
  vi.mocked(loadRolePermissions).mockResolvedValue(["users.manage"] as never);
}

describe("/api/roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it("GET cuenta los usuarios de cada rol", async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === "roles") {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: 3,
                    name: "Cajero",
                    is_system: false,
                    description: null,
                    role_permissions: [{ permission: "sales.operate" }, { permission: "viejo" }],
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return {
          select: (columns: string) =>
            columns === "role_id"
              ? {
                  eq: () => ({
                    maybeSingle: async () => ({ data: { role_id: 1 }, error: null }),
                  }),
                }
              : Promise.resolve({
                  data: [
                    { user_id: "u1", role_id: 3 },
                    { user_id: "u2", role_id: 3 },
                  ],
                  error: null,
                }),
        };
      },
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.actorRoleId).toBe(1);
    expect(json.roles[0]).toMatchObject({
      name: "Cajero",
      user_count: 2,
      permissions: ["sales.operate"],
    });
  });

  it("POST 409 si el nombre ya existe", async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
          }),
        }),
      }),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/roles", {
        method: "POST",
        body: JSON.stringify({ name: "Cajero", permissions: [] }),
      })
    );
    expect(res.status).toBe(409);
  });

  it("PATCH no deja editar permisos del rol Admin", async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 1, is_system: true, role_id: 1 }, error: null }),
          }),
        }),
      }),
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/roles/1", {
        method: "PATCH",
        body: JSON.stringify({ permissions: ["sales.operate"] }),
      }),
      { params: { id: "1" } }
    );
    expect(res.status).toBe(400);
  });

  it("DELETE 400 si el rol tiene usuarios", async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === "roles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 3, is_system: false }, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: async () => ({ count: 2, error: null }),
          }),
        };
      },
    } as never);

    const res = await DELETE(new Request("http://localhost/api/roles/3"), { params: { id: "3" } });
    expect(res.status).toBe(400);
  });
});
