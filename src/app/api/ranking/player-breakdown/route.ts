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
    const categoryId = Number(url.searchParams.get("category_id"));
    const playerId = Number(url.searchParams.get("player_id"));
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();

    if (!Number.isInteger(categoryId) || !Number.isInteger(playerId)) {
      return NextResponse.json(
        { error: "category_id and player_id are required" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const repos = await createRepositories();

    const { data: currentCategory, error: currentCategoryError } = await supabase
      .from("categories")
      .select("id, type, display_order")
      .eq("id", categoryId)
      .single();
    if (currentCategoryError || !currentCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const { data: lowerCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("type", currentCategory.type)
      .lt("display_order", currentCategory.display_order)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: sameTypeCategories, error: sameTypeCategoriesError } =
      await supabase
        .from("categories")
        .select("id, display_order")
        .eq("type", currentCategory.type);
    if (sameTypeCategoriesError) {
      return NextResponse.json(
        { error: "Failed to fetch categories" },
        { status: 500 }
      );
    }

    const categoryOrderById = new Map(
      (sameTypeCategories ?? []).map((c) => [c.id as number, c.display_order as number])
    );
    const isDamasCategory = currentCategory.type === "damas";
    const lowerCategoryId = lowerCategory ? Number(lowerCategory.id) : null;

    const isPlayerEligibleForRequestedCategory = (
      playerCategoryId: number | null
    ) => {
      if (playerCategoryId == null) return true;
      const playerOrder = categoryOrderById.get(playerCategoryId);
      if (playerOrder == null) return false;
      return playerOrder <= currentCategory.display_order;
    };

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id, first_name, last_name, category_id, female_category_id")
      .eq("id", playerId)
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const playerCategoryId = isDamasCategory
      ? (player.female_category_id as number | null)
      : (player.category_id as number | null);

    if (!isPlayerEligibleForRequestedCategory(playerCategoryId)) {
      return NextResponse.json({
        category_id: categoryId,
        year,
        player_id: playerId,
        first_name: player.first_name,
        last_name: player.last_name,
        total_points: 0,
        entries: [],
      });
    }

    const categoryIds = [categoryId, ...(lowerCategoryId != null ? [lowerCategoryId] : [])];
    const rawRows = await repos.playerTournamentPoints.findByPlayerYearAndCategories(
      playerId,
      year,
      categoryIds
    );

    const entries: Array<{
      tournament_id: number;
      tournament_name: string;
      round_reached: string;
      points_raw: number;
      points_counted: number;
      from_lower_category: boolean;
      is_grand_prix: boolean;
    }> = [];

    for (const row of rawRows) {
      let pointsCounted: number | null = null;
      let fromLower = false;

      if (row.category_id === categoryId) {
        pointsCounted = row.points;
      } else if (
        lowerCategoryId != null &&
        row.category_id === lowerCategoryId &&
        playerCategoryId === categoryId
      ) {
        pointsCounted = row.points / 2;
        fromLower = true;
      }

      if (pointsCounted == null) continue;

      entries.push({
        tournament_id: row.tournament_id,
        tournament_name: row.tournament_name,
        round_reached: row.round_reached,
        points_raw: row.points,
        points_counted: pointsCounted,
        from_lower_category: fromLower,
        is_grand_prix: row.is_grand_prix,
      });
    }

    entries.sort((a, b) => b.points_counted - a.points_counted);

    const total_points = entries.reduce((sum, e) => sum + e.points_counted, 0);

    return NextResponse.json({
      category_id: categoryId,
      year,
      player_id: playerId,
      first_name: player.first_name,
      last_name: player.last_name,
      total_points,
      entries,
    });
  } catch (err) {
    console.error("GET /ranking/player-breakdown error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
