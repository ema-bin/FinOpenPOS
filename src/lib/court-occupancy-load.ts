import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/class-occupancy";
import { clockOf } from "@/lib/clubs/settings";
import { courtOccupancy, turnUsesCourt, type CourtOccupancy, type OccupancyBlock } from "@/lib/court-occupancy";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function missingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /occupancy_(start|end)_time/i.test(error.message ?? "");
}

async function occupancyWindow(
  service: SupabaseClient,
  clubId: number,
): Promise<{ startTime: string; endTime: string }> {
  const row = await service
    .from("clubs")
    .select("open_time, close_time, occupancy_start_time, occupancy_end_time")
    .eq("id", clubId)
    .maybeSingle();
  if (row.error && missingColumn(row.error)) {
    const plain = await service.from("clubs").select("open_time, close_time").eq("id", clubId).maybeSingle();
    if (plain.error) throw new Error(plain.error.message);
    const open = clockOf(plain.data?.open_time) || "10:00";
    const close = clockOf(plain.data?.close_time) || "01:00";
    return { startTime: open, endTime: close };
  }
  if (row.error) throw new Error(row.error.message);
  const open = clockOf(row.data?.open_time) || "10:00";
  const close = clockOf(row.data?.close_time) || "01:00";
  return {
    startTime: clockOf(row.data?.occupancy_start_time) || open,
    endTime: clockOf(row.data?.occupancy_end_time) || close,
  };
}

const PAGE = 1000;

async function eachPage(
  load: (fromRow: number, toRow: number) => PromiseLike<QueryResult>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 20000; offset += PAGE) {
    const batch = rowsFrom(await load(offset, offset + PAGE - 1));
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function slotRows(service: SupabaseClient, clubId: number, from: string, to: string): Promise<Row[]> {
  const first = await service
    .from("court_slots")
    .select("court_id, slot_date, start_time, end_time, was_played, reservation_status, player1_id, player2_id, player3_id, player4_id")
    .eq("club_id", clubId)
    .gte("slot_date", from)
    .lte("slot_date", to)
    .range(0, PAGE - 1);
  if (first.error && /reservation_status/i.test(first.error.message ?? "")) {
    return eachPage((fromRow, toRow) =>
      service
        .from("court_slots")
        .select("court_id, slot_date, start_time, end_time, was_played, player1_id, player2_id, player3_id, player4_id")
        .eq("club_id", clubId)
        .gte("slot_date", from)
        .lte("slot_date", to)
        .range(fromRow, toRow),
    );
  }
  if (first.error || (first.data ?? []).length < PAGE) return rowsFrom(first);
  const rest = await eachPage((fromRow, toRow) =>
    service
      .from("court_slots")
      .select("court_id, slot_date, start_time, end_time, was_played, reservation_status, player1_id, player2_id, player3_id, player4_id")
      .eq("club_id", clubId)
      .gte("slot_date", from)
      .lte("slot_date", to)
      .range(fromRow, toRow),
  );
  return rest;
}

type QueryResult = { data: Row[] | null; error: { code?: string; message?: string } | null };

function rowsFrom(result: QueryResult): Row[] {
  if (isMissingRelation(result.error)) return [];
  if (result.error) throw new Error(result.error.message ?? "No se pudo leer la ocupación.");
  return result.data ?? [];
}

/** Arma el índice del rango de fechas con las canchas activas del complejo. */
export async function loadCourtOccupancy(
  service: SupabaseClient,
  clubId: number,
  dates: string[],
): Promise<CourtOccupancy | null> {
  const days = Array.from(new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  if (days.length === 0) return null;
  const from = days[0];
  const to = days[days.length - 1];
  const [window, courtsResult] = await Promise.all([
    occupancyWindow(service, clubId),
    service.from("courts").select("id, name").eq("club_id", clubId).eq("is_active", true).order("name"),
  ]);
  if (courtsResult.error) throw new Error(courtsResult.error.message);
  const courts = (courtsResult.data ?? []).map((court) => ({
    id: Number(court.id),
    name: String(court.name ?? "Cancha"),
  }));

  const slots = await slotRows(service, clubId, from, to);

  const [classes, matches] = await Promise.all([
    eachPage((fromRow, toRow) =>
      service
        .from("class_sessions")
        .select("court_id, session_date, start_time, end_time, status")
        .eq("club_id", clubId)
        .eq("status", "scheduled")
        .gte("session_date", from)
        .lte("session_date", to)
        .range(fromRow, toRow),
    ),
    eachPage((fromRow, toRow) =>
      service
        .from("tournament_matches")
        .select("court_id, match_date, start_time, end_time, status")
        .eq("club_id", clubId)
        .gte("match_date", from)
        .lte("match_date", to)
        .neq("status", "cancelled")
        .range(fromRow, toRow),
    ),
  ]);

  const blocks: OccupancyBlock[] = [];
  for (const slot of slots) {
    const players = [slot.player1_id, slot.player2_id, slot.player3_id, slot.player4_id];
    if (!turnUsesCourt({
      wasPlayed: Boolean(slot.was_played),
      reserved: text(slot.reservation_status) === "reserved",
      hasPlayer: players.some((player) => player != null),
    })) continue;
    blocks.push({
      courtId: Number(slot.court_id),
      date: text(slot.slot_date).slice(0, 10),
      start: text(slot.start_time),
      end: text(slot.end_time),
    });
  }
  for (const session of classes) {
    blocks.push({
      courtId: Number(session.court_id),
      date: text(session.session_date).slice(0, 10),
      start: text(session.start_time),
      end: text(session.end_time),
    });
  }
  for (const match of matches) {
    if (match.court_id == null || match.start_time == null || match.end_time == null) continue;
    blocks.push({
      courtId: Number(match.court_id),
      date: text(match.match_date).slice(0, 10),
      start: text(match.start_time),
      end: text(match.end_time),
    });
  }

  return courtOccupancy({
    courts,
    dates: days,
    startTime: window.startTime,
    endTime: window.endTime,
    blocks,
  });
}
