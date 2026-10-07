import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/tournaments/[id]/group-slots/route";
import { createMockQueryBuilderChainable } from "@/test/mock-supabase-client";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/repository-factory", () => ({
  createRepositories: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";

const TOURNAMENT_ID = 12;

describe("GET/POST /api/tournaments/[id]/group-slots (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("401 sin sesión", async () => {
      vi.mocked(createClient).mockReturnValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      } as never);

      const res = await GET(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(401);
    });

    it("400 si el id no es numérico", async () => {
      vi.mocked(createClient).mockReturnValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      } as never);

      const res = await GET(new Request("http://x"), { params: { id: "nope" } });
      expect(res.status).toBe(400);
    });

    it("200 devuelve slots ordenados del torneo", async () => {
      const slots = [
        { id: 2, slot_date: "2026-08-02", start_time: "10:00", end_time: "11:00" },
        { id: 1, slot_date: "2026-08-01", start_time: "09:00", end_time: "10:00" },
      ];
      vi.mocked(createClient).mockReturnValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
        from: vi.fn(() =>
          createMockQueryBuilderChainable({ data: slots, error: null })
        ),
      } as never);

      const res = await GET(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(slots);
    });
  });

  describe("POST", () => {
    it("401 si createRepositories lanza Unauthorized", async () => {
      vi.mocked(createRepositories).mockRejectedValue(new Error("Unauthorized"));

      const res = await POST(
        new Request("http://x", { method: "POST", body: JSON.stringify({}) }),
        { params: { id: String(TOURNAMENT_ID) } }
      );
      expect(res.status).toBe(401);
    });

    it("404 si el torneo no existe", async () => {
      vi.mocked(createRepositories).mockResolvedValue({
        tournaments: { findById: vi.fn().mockResolvedValue(null) },
      } as never);

      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify({ group_slots: [] }),
        }),
        { params: { id: String(TOURNAMENT_ID) } }
      );
      expect(res.status).toBe(404);
    });

    it("400 si el torneo no está en draft", async () => {
      vi.mocked(createRepositories).mockResolvedValue({
        tournaments: {
          findById: vi.fn().mockResolvedValue({
            id: TOURNAMENT_ID,
            status: "in_progress",
            match_duration: 60,
          }),
        },
      } as never);

      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify({
            group_slots: [
              {
                slot_date: "2026-08-01",
                start_time: "10:00",
                end_time: "12:00",
              },
            ],
          }),
        }),
        { params: { id: String(TOURNAMENT_ID) } }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/borrador/i);
    });

    it("400 si group_slots está vacío o inválido", async () => {
      vi.mocked(createRepositories).mockResolvedValue({
        tournaments: {
          findById: vi.fn().mockResolvedValue({
            id: TOURNAMENT_ID,
            status: "draft",
            match_duration: 60,
          }),
        },
      } as never);

      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify({ group_slots: [] }),
        }),
        { params: { id: String(TOURNAMENT_ID) } }
      );
      expect(res.status).toBe(400);
    });

    it("200 crea slots expandidos en borrador", async () => {
      const stored = [
        { id: 10, slot_date: "2026-08-01", start_time: "10:00", end_time: "11:00" },
        { id: 11, slot_date: "2026-08-01", start_time: "11:00", end_time: "12:00" },
      ];
      const deleteByTournamentId = vi.fn().mockResolvedValue(undefined);
      const createMany = vi.fn().mockResolvedValue(undefined);
      vi.mocked(createRepositories).mockResolvedValue({
        tournaments: {
          findById: vi.fn().mockResolvedValue({
            id: TOURNAMENT_ID,
            status: "draft",
            match_duration: 60,
          }),
        },
        tournamentGroupSlots: {
          deleteByTournamentId,
          createMany,
          findByTournamentId: vi.fn().mockResolvedValue(stored),
        },
      } as never);

      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify({
            match_duration: 60,
            group_slots: [
              {
                slot_date: "2026-08-01",
                start_time: "10:00",
                end_time: "12:00",
              },
            ],
          }),
        }),
        { params: { id: String(TOURNAMENT_ID) } }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.slots).toEqual(stored);
      expect(deleteByTournamentId).toHaveBeenCalledWith(TOURNAMENT_ID);
      expect(createMany).toHaveBeenCalled();
    });
  });
});
