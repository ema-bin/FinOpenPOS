export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { createServiceClient } from "@/lib/supabase/service";
import type { TournamentRankingPointRule } from "@/models/db/tournament-ranking-point-rule";

const ROUNDS = new Set([
  "groups",
  "16avos",
  "octavos",
  "cuartos",
  "semifinal",
  "final",
  "champion",
]);

function failed(error: unknown) {
  if (error instanceof ClubContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

function missingClubColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || /club_id/i.test(error?.message ?? "");
}

async function requireRulesRead() {
  const tournaments = await requirePermission("tournaments.manage", "read");
  if (tournaments.ok || tournaments.response.status === 401) return tournaments;
  return requirePermission("users.manage", "read");
}

export async function GET() {
  try {
    const auth = await requireRulesRead();
    if (!auth.ok) return auth.response;

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const { data, error } = await service
      .from("tournament_ranking_point_rules")
      .select("id, round_reached, points, display_order")
      .eq("club_id", clubId)
      .order("display_order", { ascending: true });

    if (missingClubColumn(error)) {
      return NextResponse.json(
        { error: "Falta aplicar el script de club_id en la base." },
        { status: 503 }
      );
    }
    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch rules" },
        { status: 500 }
      );
    }

    return NextResponse.json((data ?? []) as TournamentRankingPointRule[]);
  } catch (err) {
    console.error("GET /ranking-point-rules error:", err);
    return failed(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("users.manage", "write");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const rules = Array.isArray(body) ? body : [body];
    if (
      !rules.every(
        (rule: unknown) =>
          rule != null &&
          typeof rule === "object" &&
          "round_reached" in rule &&
          "points" in rule
      )
    ) {
      return NextResponse.json(
        { error: "Each rule must have round_reached and points" },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);

    for (const rule of rules as { round_reached: string; points: number }[]) {
      if (!ROUNDS.has(rule.round_reached)) {
        return NextResponse.json(
          { error: `Ronda inválida: ${rule.round_reached}` },
          { status: 400 }
        );
      }
      const points = Number(rule.points);
      if (!Number.isInteger(points) || points < 0 || points > 10000) {
        return NextResponse.json(
          { error: `Puntos inválidos para ${rule.round_reached}` },
          { status: 400 }
        );
      }
      const updated = await service
        .from("tournament_ranking_point_rules")
        .update({ points })
        .eq("club_id", clubId)
        .eq("round_reached", rule.round_reached)
        .select("id");
      if (missingClubColumn(updated.error)) {
        return NextResponse.json(
          { error: "Falta aplicar el script de club_id en la base." },
          { status: 503 }
        );
      }
      if (updated.error) {
        return NextResponse.json(
          { error: updated.error.message || "Failed to update rules" },
          { status: 500 }
        );
      }
      if (!updated.data?.length) {
        return NextResponse.json(
          { error: `No existe la ronda ${rule.round_reached} en este complejo` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await service
      .from("tournament_ranking_point_rules")
      .select("id, round_reached, points, display_order")
      .eq("club_id", clubId)
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
    return failed(err);
  }
}
