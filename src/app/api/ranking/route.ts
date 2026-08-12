export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { createClient } from "@/lib/supabase/server";
import { findImmediateLowerCategoryId } from "@/lib/category-skill-order";
import {
  isPlayerEligibleForRankingCategory,
  resolvePlayerCategoryIdForRanking,
} from "@/lib/tournament-category-eligibility";

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

    const { data: currentCategory, error: currentCategoryError } = await supabase
      .from("categories")
      .select("id, type, display_order, name")
      .eq("id", categoryId)
      .single();
    if (currentCategoryError || !currentCategory) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    const rankingCategoryMeta = {
      display_order: currentCategory.display_order as number,
      type: currentCategory.type as "libre" | "damas",
      name: currentCategory.name as string,
    };
    const rankingCategoryType = rankingCategoryMeta.type;

    const { data: sameTypeCategories, error: sameTypeCategoriesError } =
      await supabase
        .from("categories")
        .select("id, name, type, display_order")
        .eq("type", rankingCategoryType);
    if (sameTypeCategoriesError) {
      return NextResponse.json(
        { error: "Failed to fetch categories" },
        { status: 500 }
      );
    }

    const lowerCategoryId = findImmediateLowerCategoryId(
      (sameTypeCategories ?? []) as Array<{
        id: number;
        name: string;
        type: "libre" | "damas";
        display_order: number;
      }>,
      categoryId,
    );

    const ranking = await repos.playerTournamentPoints.getRankingByCategoryAndYear(
      categoryId,
      year
    );

    const lowerRanking = lowerCategoryId
      ? await repos.playerTournamentPoints.getRankingByCategoryAndYear(
          lowerCategoryId,
          year
        )
      : [];

    if (ranking.length === 0 && lowerRanking.length === 0) {
      return NextResponse.json({
        category_id: categoryId,
        year,
        rows: [],
      });
    }

    const playerIds = Array.from(
      new Set([...ranking, ...lowerRanking].map((r) => r.player_id))
    );
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, first_name, last_name, category_id, female_category_id")
      .in("id", playerIds);
    if (playersError) {
      return NextResponse.json(
        { error: "Failed to fetch player names" },
        { status: 500 }
      );
    }
    const playerRows = (players ?? []) as Array<{
      id: number;
      first_name: string;
      last_name: string;
      category_id: number | null;
      female_category_id: number | null;
    }>;
    const playerMap = new Map(playerRows.map((p) => [p.id, p]));

    const playerCategoryIds: number[] = [];
    for (const player of playerRows) {
      if (player.category_id != null) playerCategoryIds.push(player.category_id);
      if (player.female_category_id != null) {
        playerCategoryIds.push(player.female_category_id);
      }
    }
    const categoryMetaById = playerCategoryIds.length
      ? await repos.categories.getMetaByIds(playerCategoryIds)
      : new Map();

    const merged = new Map<
      number,
      { total_points: number; tournaments_played: number }
    >();

    for (const row of ranking) {
      const player = playerMap.get(row.player_id);
      if (!player) continue;

      const playerCategoryId = resolvePlayerCategoryIdForRanking(
        player,
        rankingCategoryType,
        categoryMetaById,
      );
      const playerCategoryMeta = playerCategoryId
        ? categoryMetaById.get(playerCategoryId)
        : undefined;
      if (!isPlayerEligibleForRankingCategory(playerCategoryMeta, rankingCategoryMeta)) {
        continue;
      }

      const current = merged.get(row.player_id) ?? {
        total_points: 0,
        tournaments_played: 0,
      };
      current.total_points += row.total_points;
      current.tournaments_played += row.tournaments_played;
      merged.set(row.player_id, current);
    }

    for (const row of lowerRanking) {
      const player = playerMap.get(row.player_id);
      if (!player) continue;

      const playerCategoryId = resolvePlayerCategoryIdForRanking(
        player,
        rankingCategoryType,
        categoryMetaById,
      );
      const playerCategoryMeta = playerCategoryId
        ? categoryMetaById.get(playerCategoryId)
        : undefined;
      if (!isPlayerEligibleForRankingCategory(playerCategoryMeta, rankingCategoryMeta)) {
        continue;
      }
      if (playerCategoryId !== categoryId) continue;

      const current = merged.get(row.player_id) ?? {
        total_points: 0,
        tournaments_played: 0,
      };
      current.total_points += row.total_points / 2;
      current.tournaments_played += row.tournaments_played / 2;
      merged.set(row.player_id, current);
    }

    const ordered = Array.from(merged.entries())
      .map(([player_id, stats]) => ({ player_id, ...stats }))
      .sort((a, b) => b.total_points - a.total_points);

    const rows = ordered.map((r, index) => {
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
