import { describe, expect, it, vi } from "vitest";
import {
  TournamentGroupSlotsRepository,
  TournamentsRepository,
} from "@/repositories/tournaments.repository";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
} from "@/test/mock-supabase-client";

describe("TournamentsRepository (repositories + Supabase mock)", () => {
  it("findAll mapea nombre de categoría y ordena por created_at", async () => {
    const rows = [
      {
        id: 1,
        name: "Torneo A",
        status: "draft",
        category_id: 10,
        category: { name: "7ma" },
      },
    ];
    const builder = createMockQueryBuilder({ data: rows, error: null });
    const supabase = createMockSupabaseClient({
      tournaments: () => builder,
    });

    const repo = new TournamentsRepository(supabase as never, "user-abc");
    const result = await repo.findAll();

    expect(supabase.from).toHaveBeenCalledWith("tournaments");
    expect(builder.select).toHaveBeenCalled();
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result[0].category).toBe("7ma");
    expect(result[0].name).toBe("Torneo A");
  });

  it("findAll aplica filtro .in(status) cuando hay statuses", async () => {
    const builder = createMockQueryBuilder({ data: [], error: null });
    const supabase = createMockSupabaseClient({
      tournaments: () => builder,
    });

    const repo = new TournamentsRepository(supabase as never, "user-abc");
    await repo.findAll(["draft", "in_progress"]);

    expect(builder.in).toHaveBeenCalledWith("status", ["draft", "in_progress"]);
  });

  it("findById devuelve null con PGRST116", async () => {
    const builder = createMockQueryBuilder({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });
    const supabase = createMockSupabaseClient({
      tournaments: () => builder,
    });

    const repo = new TournamentsRepository(supabase as never, "user-abc");
    const result = await repo.findById(999);

    expect(builder.eq).toHaveBeenCalledWith("id", 999);
    expect(builder.single).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("findById normaliza categoría", async () => {
    const row = {
      id: 5,
      name: "Copa",
      category: { name: "Libre" },
    };
    const builder = createMockQueryBuilder({ data: row, error: null });
    const supabase = createMockSupabaseClient({
      tournaments: () => builder,
    });

    const repo = new TournamentsRepository(supabase as never, "user-abc");
    const result = await repo.findById(5);

    expect(result?.category).toBe("Libre");
    expect(result?.name).toBe("Copa");
  });

  it("create inserta draft con user_uid", async () => {
    const inserted = { id: 12, name: "Nuevo", status: "draft", category: null };
    const builder = createMockQueryBuilder({ data: inserted, error: null });
    const supabase = createMockSupabaseClient({
      tournaments: () => builder,
    });

    const repo = new TournamentsRepository(supabase as never, "uid-99");
    const result = await repo.create({ name: "Nuevo" });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nuevo",
        status: "draft",
        user_uid: "uid-99",
      })
    );
    expect(result.id).toBe(12);
  });

  it("update lanza si Supabase devuelve error", async () => {
    const builder = createMockQueryBuilder({
      data: null,
      error: { message: "update failed" },
    });
    const supabase = createMockSupabaseClient({
      tournaments: () => builder,
    });

    const repo = new TournamentsRepository(supabase as never, "user-abc");
    await expect(repo.update(1, { name: "X" })).rejects.toThrow(
      "Failed to update tournament: update failed"
    );
    expect(builder.eq).toHaveBeenCalledWith("id", 1);
  });
});

describe("TournamentGroupSlotsRepository (repositories + Supabase mock)", () => {
  it("createMany devuelve [] sin llamar a insert", async () => {
    const builder = createMockQueryBuilder({ data: [], error: null });
    const supabase = createMockSupabaseClient({
      tournament_group_slots: () => builder,
    });

    const repo = new TournamentGroupSlotsRepository(supabase as never, "user-1");
    const result = await repo.createMany(7, []);

    expect(result).toEqual([]);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("findByTournamentId filtra por torneo y ordena", async () => {
    const slots = [
      { id: 1, tournament_id: 3, slot_date: "2026-06-01", start_time: "10:00", end_time: "11:00" },
    ];
    const builder = createMockQueryBuilder({ data: slots, error: null });
    const supabase = createMockSupabaseClient({
      tournament_group_slots: () => builder,
    });

    const repo = new TournamentGroupSlotsRepository(supabase as never, "user-1");
    const result = await repo.findByTournamentId(3);

    expect(builder.eq).toHaveBeenCalledWith("tournament_id", 3);
    expect(builder.order).toHaveBeenCalledWith("slot_date", { ascending: true });
    expect(builder.order).toHaveBeenCalledWith("start_time", { ascending: true });
    expect(result).toEqual(slots);
  });

  it("deleteByTournamentId usa delete + eq", async () => {
    const builder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabaseClient({
      tournament_group_slots: () => builder,
    });

    const repo = new TournamentGroupSlotsRepository(supabase as never, "user-1");
    await repo.deleteByTournamentId(8);

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("tournament_id", 8);
  });
});
