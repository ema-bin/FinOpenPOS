export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import type { TournamentStatus } from "@/models/db/tournament";

const ALLOWED_STATUSES: TournamentStatus[] = [
  "draft",
  "schedule_review",
  "in_progress",
  "finished",
  "cancelled",
];

export async function GET(request: Request) {
  try {
    const repos = await createRepositories();
    const statusParam = (request as any).nextUrl.searchParams.get("status");
    const requestedStatuses = statusParam
      ? Array.from(
          new Set(
            statusParam
              .split(",")
              .map((status: string) => status.trim())
              .filter((status: string) => ALLOWED_STATUSES.includes(status as TournamentStatus))
          )
        )
      : [];
    const statusesFilter =
      requestedStatuses.length > 0
        ? (requestedStatuses as TournamentStatus[])
        : undefined;

    const tournaments = await repos.tournaments.findAll(statusesFilter);
    return NextResponse.json(tournaments);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error("GET /tournaments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const body = await request.json();
    const { name, description, category_id, is_puntuable, is_category_specific, start_date, end_date, has_super_tiebreak, match_duration, registration_fee } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Convertir cadenas vacías a null para fechas opcionales
    const normalizeDate = (date: string | null | undefined): string | null => {
      if (!date || date.trim() === "") return null;
      return date;
    };

    const tournament = await repos.tournaments.create({
      name: name.trim(),
      description: description ?? null,
      category_id: category_id ?? null,
      is_puntuable: is_puntuable ?? false,
      is_category_specific: is_category_specific ?? false,
      start_date: normalizeDate(start_date),
      end_date: normalizeDate(end_date),
      has_super_tiebreak: has_super_tiebreak ?? false,
      match_duration: match_duration ?? 60,
      registration_fee: typeof registration_fee === "number" ? registration_fee : Number(registration_fee) || 0,
    });

    return NextResponse.json(tournament);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error("POST /tournaments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
