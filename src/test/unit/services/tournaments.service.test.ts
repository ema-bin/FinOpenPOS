import { afterEach, describe, expect, it, vi } from "vitest";
import { tournamentsService } from "@/services/tournaments.service";

describe("TournamentsService (services)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getAll agrega filtro de status en query string", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await tournamentsService.getAll(["draft", "schedule_review"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tournaments?status=draft%2Cschedule_review"
    );
  });

  it("finish propaga error del API", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "No se puede finalizar" }),
    } as Response);

    await expect(tournamentsService.finish(99)).rejects.toThrow("No se puede finalizar");
  });
});
