export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";

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

function expandRangesToSlots(
  groupSlots: Array<{ slot_date: string; start_time: string; end_time: string }>,
  matchDurationMinutes: number
): Array<{ slot_date: string; start_time: string; end_time: string }> {
  const timeToMinutes = (timeStr: string, asEndOfDay = false): number => {
    const s = String(timeStr).trim();
    if (asEndOfDay && (s === "00:00" || s === "24:00" || s === "0:00")) return 24 * 60;
    const parts = s.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parts[1] ? parseInt(parts[1], 10) || 0 : 0;
    return h * 60 + m;
  };
  const minutesToTime = (total: number): string => {
    if (total >= 24 * 60) return "00:00";
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const duration = Math.max(15, matchDurationMinutes);
  const expanded: Array<{ slot_date: string; start_time: string; end_time: string }> = [];
  for (const block of groupSlots) {
    if (
      !block ||
      typeof block.slot_date !== "string" ||
      typeof block.start_time !== "string" ||
      typeof block.end_time !== "string"
    )
      continue;
    const slotDate = String(block.slot_date).trim();
    if (!slotDate) continue;
    const startM = timeToMinutes(block.start_time, false);
    const endM = timeToMinutes(block.end_time, true);
    for (let t = startM; t + duration <= endM; t += duration) {
      expanded.push({
        slot_date: slotDate,
        start_time: minutesToTime(t),
        end_time: minutesToTime(t + duration),
      });
    }
  }
  return expanded;
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
