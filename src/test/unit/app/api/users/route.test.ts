import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/users/route";
import { PATCH } from "@/app/api/users/[id]/route";
import { POST as resetPassword } from "@/app/api/users/[id]/password/route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/auth/load-role-permissions", () => ({ loadRolePermissions: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";

function asUser(id: string | null, permissions: string[] | null) {
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null } }),
    },
  } as never);
  vi.mocked(loadRolePermissions).mockResolvedValue(permissions as never);
}

describe("/api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET 401 sin sesión", async () => {
    asUser(null, null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET 403 sin users.manage", async () => {
    asUser("cajero", ["sales.operate"]);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET junta usuarios con su rol", async () => {
    asUser("admin", ["users.manage"]);
    const service = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: {
              users: [
                { id: "u2", email: "b@x.com", user_metadata: { name: "Beto" } },
                { id: "admin", email: "a@x.com", user_metadata: {} },
              ],
            },
            error: null,
          }),
        },
      },
      from: (table: string) => {
        if (table === "roles") {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: 1,
                    name: "Admin",
                    is_system: true,
                    description: null,
                    role_permissions: [],
                  },
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
          select: async () => ({
            data: [{ user_id: "u2", role_id: 3 }],
            error: null,
          }),
        };
      },
    };
    vi.mocked(createServiceClient).mockReturnValue(service as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.currentUserId).toBe("admin");
    expect(json.users.map((u: { email: string }) => u.email)).toEqual(["a@x.com", "b@x.com"]);
    expect(json.users[1]).toMatchObject({ email: "b@x.com", name: "Beto", role_id: 3 });
    expect(json.roles[1].permissions).toEqual(["sales.operate"]);
  });

  it("PATCH 400 si el admin se saca el rol a sí mismo siendo el único", async () => {
    asUser("admin", ["users.manage"]);
    const upsert = vi.fn();
    vi.mocked(createServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === "roles") {
          return {
            select: async () => ({
              data: [
                { id: 1, is_system: true, role_permissions: [] },
                { id: 3, is_system: false, role_permissions: [{ permission: "sales.operate" }] },
              ],
              error: null,
            }),
          };
        }
        return {
          select: async () => ({
            data: [{ user_id: "admin", role_id: 1 }],
            error: null,
          }),
          upsert,
        };
      },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/users/admin", {
        method: "PATCH",
        body: JSON.stringify({ roleId: 3 }),
      }),
      { params: { id: "admin" } }
    );

    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("PATCH guarda el rol de otra persona", async () => {
    asUser("admin", ["users.manage"]);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === "roles") {
          return {
            select: async () => ({
              data: [
                { id: 1, is_system: true, role_permissions: [] },
                { id: 3, is_system: false, role_permissions: [{ permission: "courts.operate" }] },
              ],
              error: null,
            }),
          };
        }
        return {
          select: async () => ({
            data: [
              { user_id: "admin", role_id: 1 },
              { user_id: "u2", role_id: 1 },
            ],
            error: null,
          }),
          upsert,
        };
      },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/users/u2", {
        method: "PATCH",
        body: JSON.stringify({ roleId: 3 }),
      }),
      { params: { id: "u2" } }
    );

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u2", role_id: 3, assigned_by: "admin" }),
      { onConflict: "user_id" }
    );
  });

  it("POST 400 con email inválido", async () => {
    asUser("admin", ["users.manage"]);
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({ email: "no-es-mail", password: "123456", roleId: 3 }),
      })
    );
    expect(res.status).toBe(400);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("POST crea el usuario, confirma el email y le asigna el rol", async () => {
    asUser("admin", ["users.manage"]);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "new-1" } },
      error: null,
    });
    vi.mocked(createServiceClient).mockReturnValue({
      auth: { admin: { createUser, deleteUser: vi.fn() } },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 3 }, error: null }),
          }),
        }),
        insert,
      }),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: "Nuevo@Club.com",
          password: "secreto",
          name: "Nuevo",
          roleId: 3,
        }),
      })
    );

    expect(res.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({
      email: "nuevo@club.com",
      password: "secreto",
      email_confirm: true,
      user_metadata: { full_name: "Nuevo" },
    });
    expect(insert).toHaveBeenCalledWith({
      user_id: "new-1",
      role_id: 3,
      assigned_by: "admin",
    });
  });

  it("POST 409 si el email ya existe", async () => {
    asUser("admin", ["users.manage"]);
    vi.mocked(createServiceClient).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "A user with this email address has already been registered" },
          }),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 3 }, error: null }),
          }),
        }),
      }),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({ email: "a@x.com", password: "123456", roleId: 3 }),
      })
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Ya existe un usuario con ese email" });
  });

  it("POST /password reemplaza la contraseña", async () => {
    asUser("admin", ["users.manage"]);
    const updateUserById = vi.fn().mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    vi.mocked(createServiceClient).mockReturnValue({
      auth: { admin: { updateUserById } },
    } as never);

    const res = await resetPassword(
      new Request("http://localhost/api/users/u2/password", {
        method: "POST",
        body: JSON.stringify({ password: "temporaria" }),
      }),
      { params: { id: "u2" } }
    );

    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith("u2", { password: "temporaria" });
  });

  it("POST /password 403 sin permiso", async () => {
    asUser("cajero", ["sales.operate"]);
    const res = await resetPassword(
      new Request("http://localhost/api/users/u2/password", {
        method: "POST",
        body: JSON.stringify({ password: "temporaria" }),
      }),
      { params: { id: "u2" } }
    );
    expect(res.status).toBe(403);
  });
});
