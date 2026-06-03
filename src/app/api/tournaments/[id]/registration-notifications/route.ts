export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { createClient } from "@/lib/supabase/server";
import { resolveTournamentPromoFlyerUrl } from "@/lib/app-origin";
import {
  applyRegistrationMessagePlaceholders,
  buildDefaultRegistrationInviteMessage,
} from "@/lib/tournament-registration-notifications";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const FEMALE_GENDER_VALUES = new Set(["female", "f", "femenino", "mujer"]);

type RouteParams = { params: { id: string } };

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentId = Number(params.id);
    if (!Number.isInteger(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const repos = await createRepositories();
    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const teams = await repos.tournamentTeams.findByTournamentId(tournamentId);
    const enrolledIds = new Set<number>();
    for (const team of teams) {
      if (team.player1_id) enrolledIds.add(team.player1_id);
      if (team.player2_id) enrolledIds.add(team.player2_id);
    }

    if (tournament.is_suma_13_damas) {
      const { data: players, error } = await supabase
        .from("players")
        .select(
          "id, first_name, last_name, phone, status, gender, female_category_id, female_category:categories!female_category_id(name)"
        )
        .eq("status", "active")
        .not("female_category_id", "is", null);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = (players ?? []).filter((p) => {
        const gender = (p.gender as string | null)?.toLowerCase().trim() ?? "";
        return FEMALE_GENDER_VALUES.has(gender);
      });

      return buildResponse(req, {
        tournament,
        categoryName: tournament.category ?? "Suma 13 damas",
        listMode: "suma_13_damas",
        rows,
        enrolledIds,
      });
    }

    if (tournament.category_id == null) {
      return NextResponse.json({
        available: false,
        reason:
          "Este torneo no tiene categoría asignada. Asignala al crear o editar el torneo para ver jugadores sin inscribir.",
        tournament_name: tournament.name,
        category_name: null,
        default_message: "",
        players: [],
        enrolled_count: enrolledIds.size,
        unregistered_count: 0,
      });
    }

    const { data: category, error: catError } = await supabase
      .from("categories")
      .select("id, name, type")
      .eq("id", tournament.category_id)
      .single();
    if (catError || !category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const isDamas = category.type === "damas";
    const categoryField = isDamas ? "female_category_id" : "category_id";

    const { data: players, error } = await supabase
      .from("players")
      .select(
        `id, first_name, last_name, phone, status, category_id, female_category_id, category:categories!category_id(name), female_category:categories!female_category_id(name)`
      )
      .eq("status", "active")
      .eq(categoryField, tournament.category_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return buildResponse(req, {
      tournament,
      categoryName: category.name as string,
      listMode: isDamas ? "damas_category" : "libre_category",
      rows: players ?? [],
      enrolledIds,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET registration-notifications error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

function pickCategoryName(row: Record<string, unknown>): string | null {
  const libre = row.category as { name: string } | { name: string }[] | null;
  const damas = row.female_category as { name: string } | { name: string }[] | null;
  const pick = (v: typeof libre) =>
    v == null ? null : Array.isArray(v) ? (v[0]?.name ?? null) : v.name ?? null;
  return pick(libre) ?? pick(damas);
}

function buildResponse(
  _req: Request,
  input: {
    tournament: {
      id: number;
      name: string;
      category: string | null;
      registration_fee?: number;
      status: string;
      promo_flyer_url?: string | null;
    };
    categoryName: string;
    listMode: string;
    rows: Array<Record<string, unknown>>;
    enrolledIds: Set<number>;
  }
) {
  const flyer_url = resolveTournamentPromoFlyerUrl(input.tournament);
  const default_message = buildDefaultRegistrationInviteMessage({
    tournamentName: input.tournament.name,
    categoryName: input.categoryName,
    registrationFee: input.tournament.registration_fee,
  });

  const unregistered = input.rows
    .filter((p) => !input.enrolledIds.has(p.id as number))
    .map((p) => {
      const phone = (p.phone as string | null) ?? null;
      return {
        id: p.id as number,
        first_name: p.first_name as string,
        last_name: p.last_name as string,
        phone,
        category_label: pickCategoryName(p),
        has_phone: Boolean(phone?.trim()),
        whatsapp_url: buildWhatsAppUrl(
          phone,
          applyRegistrationMessagePlaceholders(default_message, {
            first_name: p.first_name as string,
            last_name: p.last_name as string,
          }),
          "app"
        ),
      };
    })
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "es")
    );

  return NextResponse.json({
    available: true,
    list_mode: input.listMode,
    tournament_name: input.tournament.name,
    category_name: input.categoryName,
    tournament_status: input.tournament.status,
    default_message,
    flyer_url,
    players: unregistered,
    enrolled_count: input.enrolledIds.size,
    unregistered_count: unregistered.length,
  });
}
