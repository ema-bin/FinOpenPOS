export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";
import { backfillTeamScheduleRestrictions } from "@/lib/backfill-team-schedule-restrictions";
import {
  expandRangesToSlots,
  filterNewSlots,
  normalizeSlotTime,
} from "@/lib/expand-tournament-group-slots";

type RouteParams = { params: { id: string } };

const EDITABLE_STATUSES = new Set(["draft", "schedule_review"]);

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const repos = await createRepositories();
    const tournamentId = Number(params.id);
    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (!EDITABLE_STATUSES.has(tournament.status)) {
      return NextResponse.json(
        {
          error:
            "Solo se pueden agregar horarios en torneos en borrador o revisión de horarios",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { group_slots, match_duration } = body;
    if (!Array.isArray(group_slots) || group_slots.length === 0) {
      return NextResponse.json(
        {
          error:
            "group_slots debe ser un array con al menos un rango (slot_date, start_time, end_time)",
        },
        { status: 400 }
      );
    }

    const validRanges = group_slots.filter(
      (b: unknown) =>
        b &&
        typeof b === "object" &&
        typeof (b as { slot_date?: unknown }).slot_date === "string" &&
        typeof (b as { start_time?: unknown }).start_time === "string" &&
        typeof (b as { end_time?: unknown }).end_time === "string" &&
        String((b as { slot_date: string }).slot_date).trim() !== ""
    );
    if (validRanges.length === 0) {
      return NextResponse.json(
        { error: "Ningún rango válido (slot_date, start_time, end_time)" },
        { status: 400 }
      );
    }

    const matchDurationMinutes = Math.max(
      15,
      Number(match_duration) ?? tournament.match_duration ?? 60
    );
    const expanded = expandRangesToSlots(validRanges, matchDurationMinutes);
    if (expanded.length === 0) {
      return NextResponse.json(
        { error: "No se generaron slots con los rangos indicados" },
        { status: 400 }
      );
    }

    const existingSlots = await repos.tournamentGroupSlots.findByTournamentId(tournamentId);
    const existingRanges = existingSlots.map((s) => ({
      slot_date: s.slot_date,
      start_time: normalizeSlotTime(s.start_time),
      end_time: normalizeSlotTime(s.end_time),
    }));
    const newSlots = filterNewSlots(expanded, existingRanges);

    if (newSlots.length === 0) {
      return NextResponse.json(
        { error: "Los rangos indicados no generan slots nuevos (ya existen)" },
        { status: 400 }
      );
    }

    const created = await repos.tournamentGroupSlots.createMany(tournamentId, newSlots);
    const newSlotIds = created.map((s) => s.id);

    const backfill = await backfillTeamScheduleRestrictions(
      supabase,
      tournamentId,
      user.id,
      newSlotIds,
      false
    );

    const slots = await repos.tournamentGroupSlots.findByTournamentId(tournamentId);
    return NextResponse.json({
      ok: true,
      added: created.length,
      slots,
      restrictionsBackfill: backfill,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /tournaments/:id/group-slots/append error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
