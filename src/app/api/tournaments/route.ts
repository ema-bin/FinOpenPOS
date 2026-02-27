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
    const { name, description, category_id, is_puntuable, is_category_specific, is_suma_13_damas, start_date, end_date, has_super_tiebreak, match_duration, registration_fee, group_slots } = body;

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
      is_suma_13_damas: is_suma_13_damas ?? false,
      start_date: normalizeDate(start_date),
      end_date: normalizeDate(end_date),
      has_super_tiebreak: has_super_tiebreak ?? false,
      match_duration: match_duration ?? 60,
      registration_fee: typeof registration_fee === "number" ? registration_fee : Number(registration_fee) || 0,
    });

    if (Array.isArray(group_slots) && group_slots.length > 0) {
      const durationMinutes = Math.max(15, Number(match_duration) || 60);

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

      const expanded: Array<{ slot_date: string; start_time: string; end_time: string }> = [];
      for (const block of group_slots) {
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
        for (let t = startM; t + durationMinutes <= endM; t += durationMinutes) {
          expanded.push({
            slot_date: slotDate,
            start_time: minutesToTime(t),
            end_time: minutesToTime(t + durationMinutes),
          });
        }
      }
      if (expanded.length > 0) {
        await repos.tournamentGroupSlots.createMany(tournament.id, expanded);
      }
    }

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
