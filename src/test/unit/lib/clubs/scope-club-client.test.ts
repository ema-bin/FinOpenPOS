import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scopeClubClient, stampClubId } from "@/lib/clubs/scope-club-client";

function fakeBuilder() {
  const steps: string[] = [];
  const builder = {
    insert(values: unknown) {
      steps.push(`insert:${JSON.stringify(values)}`);
      return builder;
    },
    select(...args: unknown[]) {
      steps.push(`select:${args.length}`);
      return builder;
    },
    update(values: unknown) {
      steps.push(`update:${JSON.stringify(values)}`);
      return builder;
    },
    eq(column: string, value: unknown) {
      steps.push(`eq:${column}=${String(value)}`);
      return builder;
    },
  };
  return { builder, steps };
}

describe("cliente acotado al club", () => {
  it("pisa el club_id que manda el cliente", () => {
    expect(stampClubId({ name: "Efectivo", club_id: 9 }, 1)).toEqual({ name: "Efectivo", club_id: 1 });
  });

  it("filtra la lectura y sella el insert", () => {
    const players = fakeBuilder();
    const categories = fakeBuilder();
    const supabase = {
      from(table: string) {
        return table === "players" ? players.builder : categories.builder;
      },
    } as unknown as SupabaseClient;

    const scoped = scopeClubClient(supabase, 3);
    scoped.from("players").select("id").eq("status", "active");
    scoped.from("players").insert({ name: "Ana", club_id: 8 });
    scoped.from("categories").select("id");

    expect(players.steps).toEqual([
      "select:1",
      "eq:club_id=3",
      "eq:status=active",
      'insert:{"name":"Ana","club_id":3}',
    ]);
    expect(categories.steps).toEqual(["select:1"]);
  });
});
