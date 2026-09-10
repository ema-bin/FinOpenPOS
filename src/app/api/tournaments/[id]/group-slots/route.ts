export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";
import { expandRangesToSlots } from "@/lib/expand-tournament-group-slots";

type RouteParams = { params: { id: string } };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: slots, error } = await supabase
      .from("tournament_group_slots")
      .select("id, slot_date, start_time, end_time")
      .eq("tournament_id", tournamentId)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching group slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch slots" },
        { status: 500 }
      );
    }

    return NextResponse.json(slots ?? []);
  } catch (err) {
    console.error("GET /tournaments/:id/group-slots error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const repos = await createRepositories();
    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (tournament.status !== "draft") {
      return NextResponse.json(
        { error: "Solo se pueden configurar horarios en torneos en estado borrador" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { group_slots, match_duration } = body;
    if (!Array.isArray(group_slots) || group_slots.length === 0) {
      return NextResponse.json(
        { error: "group_slots debe ser un array con al menos un rango (slot_date, start_time, end_time)" },
        { status: 400 }
      );
    }

    const validRanges = group_slots.filter(
      (b: unknown) =>
        b &&
        typeof b === "object" &&
        typeof (b as any).slot_date === "string" &&
        typeof (b as any).start_time === "string" &&
        typeof (b as any).end_time === "string" &&
        String((b as any).slot_date).trim() !== ""
    );
    if (validRanges.length === 0) {
      return NextResponse.json(
        { error: "Ningún rango válido (slot_date, start_time, end_time)" },
        { status: 400 }
      );
    }

    const matchDurationMinutes = Math.max(15, Number(match_duration) ?? tournament.match_duration ?? 60);
    const expanded = expandRangesToSlots(validRanges, matchDurationMinutes);
    if (expanded.length === 0) {
      return NextResponse.json(
        { error: "No se generaron slots con los rangos indicados" },
        { status: 400 }
      );
    }

    await repos.tournamentGroupSlots.deleteByTournamentId(tournamentId);
    await repos.tournamentGroupSlots.createMany(tournamentId, expanded);

    const slots = await repos.tournamentGroupSlots.findByTournamentId(tournamentId);
    return NextResponse.json({ ok: true, slots });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /tournaments/:id/group-slots error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
