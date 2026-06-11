export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";

export async function GET(req: Request) {
  try {
    const repos = await createRepositories();
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids")?.trim();

    let tournamentIds: number[] = [];
    if (idsParam) {
      tournamentIds = idsParam
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else {
      const supabase = createClient();
      const { data: playoffRows, error } = await supabase
        .from("tournament_playoffs")
        .select("tournament_id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const unique = new Set<number>();
      for (const row of playoffRows ?? []) {
        if (row.tournament_id) unique.add(row.tournament_id);
      }
      tournamentIds = Array.from(unique).sort((a, b) => a - b);
    }

    if (tournamentIds.length === 0) {
      return NextResponse.json({ tournaments: [] });
    }

    const tournaments: Array<{
      id: number;
      name: string;
      status: string;
      match_duration: number | null;
      match_duration_quarters_onwards: number | null;
      rows: Awaited<
        ReturnType<typeof repos.tournamentPlayoffs.findByTournamentId>
      >;
    }> = [];

    for (const id of tournamentIds) {
      const tournament = await repos.tournaments.findById(id);
      if (!tournament) continue;
      const rows = await repos.tournamentPlayoffs.findByTournamentId(id);
      if (!rows.length) continue;
      tournaments.push({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        match_duration: tournament.match_duration,
        match_duration_quarters_onwards:
          tournament.match_duration_quarters_onwards,
        rows,
      });
    }

    return NextResponse.json({ tournaments });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET playoffs-ready schedule-preview error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
