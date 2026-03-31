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

    // Regla de ascenso: al ranking de la categoría actual se le suma
    // 50% de puntos/torneos de la categoría inmediatamente inferior.
    const { data: currentCategory, error: currentCategoryError } = await supabase
      .from("categories")
      .select("id, type, display_order")
      .eq("id", categoryId)
      .single();
    if (currentCategoryError || !currentCategory) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
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

    const lowerRanking = lowerCategory
      ? await repos.playerTournamentPoints.getRankingByCategoryAndYear(
          Number(lowerCategory.id),
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
      new Set(
        [...ranking, ...lowerRanking].map((r) => r.player_id)
      )
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
    const isDamasCategory = currentCategory.type === "damas";

    const merged = new Map<
      number,
      { total_points: number; tournaments_played: number }
    >();

    const isPlayerEligibleForRequestedCategory = (
      playerCategoryId: number | null
    ) => {
      // Si no tiene categoría seteada, también debe aparecer.
      if (playerCategoryId == null) return true;
      const playerOrder = categoryOrderById.get(playerCategoryId);
      if (playerOrder == null) return false;
      // Igual o inferior a la categoría consultada.
      return playerOrder <= currentCategory.display_order;
    };

    for (const row of ranking) {
      const player = playerMap.get(row.player_id);
      if (!player) continue;
      const playerCategoryId = isDamasCategory
        ? player.female_category_id
        : player.category_id;
      if (!isPlayerEligibleForRequestedCategory(playerCategoryId)) continue;

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
      const playerCategoryId = isDamasCategory
        ? player.female_category_id
        : player.category_id;
      if (!isPlayerEligibleForRequestedCategory(playerCategoryId)) continue;
      // La ponderación 50% de la categoría inferior aplica solo si el jugador
      // hoy pertenece exactamente a la categoría consultada (caso ascenso).
      // Ej: hoy 7ma, torneo viejo de 8va -> cuenta al 50% en ranking de 7ma.
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
