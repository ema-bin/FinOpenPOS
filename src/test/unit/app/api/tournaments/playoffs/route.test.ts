import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "@/app/api/tournaments/[id]/playoffs/route";

vi.mock("@/lib/repository-factory", () => ({
  createRepositories: vi.fn(),
}));

vi.mock("@/lib/group-test-tools", () => ({
  isGroupTestToolsEnabledServer: vi.fn(),
}));

import { createRepositories } from "@/lib/repository-factory";
import { isGroupTestToolsEnabledServer } from "@/lib/group-test-tools";

const TOURNAMENT_ID = 99;

describe("GET/DELETE /api/tournaments/[id]/playoffs (api)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("400 si el id no es numérico", async () => {
      vi.mocked(createRepositories).mockResolvedValue({
        tournamentPlayoffs: { findByTournamentId: vi.fn() },
      } as never);

      const res = await GET(new Request("http://x"), { params: { id: "abc" } });
      expect(res.status).toBe(400);
    });

    it("401 si createRepositories lanza Unauthorized", async () => {
      vi.mocked(createRepositories).mockRejectedValue(new Error("Unauthorized"));

      const res = await GET(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(401);
    });

    it("200 con filas de playoff del torneo", async () => {
      const rows = [{ id: 1, round: "cuartos", bracket_pos: 1 }];
      vi.mocked(createRepositories).mockResolvedValue({
        tournamentPlayoffs: {
          findByTournamentId: vi.fn().mockResolvedValue(rows),
        },
      } as never);

      const res = await GET(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(rows);
    });
  });

  describe("DELETE", () => {
    it("404 si test tools deshabilitados", async () => {
      vi.mocked(isGroupTestToolsEnabledServer).mockReturnValue(false);

      const res = await DELETE(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(404);
    });

    it("404 si el torneo no existe", async () => {
      vi.mocked(isGroupTestToolsEnabledServer).mockReturnValue(true);
      vi.mocked(createRepositories).mockResolvedValue({
        tournaments: { findById: vi.fn().mockResolvedValue(null) },
        tournamentPlayoffs: { deleteByTournamentId: vi.fn() },
      } as never);

      const res = await DELETE(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(404);
    });

    it("200 elimina playoffs cuando test tools están habilitados", async () => {
      vi.mocked(isGroupTestToolsEnabledServer).mockReturnValue(true);
      const deleteByTournamentId = vi.fn().mockResolvedValue(undefined);
      vi.mocked(createRepositories).mockResolvedValue({
        tournaments: {
          findById: vi.fn().mockResolvedValue({ id: TOURNAMENT_ID, status: "in_progress" }),
        },
        tournamentPlayoffs: { deleteByTournamentId },
      } as never);

      const res = await DELETE(new Request("http://x"), { params: { id: String(TOURNAMENT_ID) } });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true });
      expect(deleteByTournamentId).toHaveBeenCalledWith(TOURNAMENT_ID);
    });
  });
});
