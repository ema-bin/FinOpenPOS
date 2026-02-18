export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const categoryIdParam = url.searchParams.get("category_id");
    const yearParam = url.searchParams.get("year");

    if (!categoryIdParam) {
      return NextResponse.json(
        { error: "category_id is required" },
        { status: 400 }
      );
    }
    const categoryId = Number(categoryIdParam);
    if (!Number.isInteger(categoryId)) {
      return NextResponse.json(
        { error: "Invalid category_id" },
        { status: 400 }
      );
    }

    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const repos = await createRepositories();
    const ranking = await repos.playerTournamentPoints.getRankingByCategoryAndYear(
      categoryId,
      year
    );

    if (ranking.length === 0) {
      return NextResponse.json({
        category_id: categoryId,
        year,
        rows: [],
      });
    }

    const playerIds = [...new Set(ranking.map((r) => r.player_id))];
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .in("id", playerIds);
    if (playersError) {
      return NextResponse.json(
        { error: "Failed to fetch player names" },
        { status: 500 }
      );
    }
    const playerMap = new Map(
      (players ?? []).map((p: { id: number; first_name: string; last_name: string }) => [
        p.id,
        { first_name: p.first_name, last_name: p.last_name },
      ])
    );

    const rows = ranking.map((r, index) => {
      const player = playerMap.get(r.player_id);
      return {
        position: index + 1,
        player_id: r.player_id,
        first_name: player?.first_name ?? "",
        last_name: player?.last_name ?? "",
        total_points: r.total_points,
        tournaments_played: r.tournaments_played,
      };
    });

    return NextResponse.json({
      category_id: categoryId,
      year,
      rows,
    });
  } catch (err) {
    console.error("GET /ranking error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
