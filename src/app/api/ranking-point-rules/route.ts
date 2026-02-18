export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TournamentRankingPointRule } from "@/models/db/tournament-ranking-point-rule";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("tournament_ranking_point_rules")
      .select("id, round_reached, points, display_order")
      .order("display_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch rules" },
        { status: 500 }
      );
    }

    return NextResponse.json((data ?? []) as TournamentRankingPointRule[]);
  } catch (err) {
    console.error("GET /ranking-point-rules error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rules = Array.isArray(body) ? body : [body];
    if (
      !rules.every(
        (r: unknown) =>
          r != null &&
          typeof r === "object" &&
          "round_reached" in r &&
          "points" in r
      )
    ) {
      return NextResponse.json(
        { error: "Each rule must have round_reached and points" },
        { status: 400 }
      );
    }

    for (const r of rules as { round_reached: string; points: number }[]) {
      const points = Number(r.points);
      if (!Number.isInteger(points) || points < 0) {
        return NextResponse.json(
          { error: `Invalid points for ${r.round_reached}` },
          { status: 400 }
        );
      }
      const { error } = await supabase
        .from("tournament_ranking_point_rules")
        .update({ points })
        .eq("round_reached", r.round_reached);
      if (error) {
        return NextResponse.json(
          { error: error.message || "Failed to update rules" },
          { status: 500 }
        );
      }
    }

    const { data, error } = await supabase
      .from("tournament_ranking_point_rules")
      .select("id, round_reached, points, display_order")
      .order("display_order", { ascending: true });
    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch updated rules" },
        { status: 500 }
      );
    }
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("PATCH /ranking-point-rules error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
