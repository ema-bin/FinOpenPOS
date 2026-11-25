export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { clockOf, parseClubSettings, type ClubSettings } from "@/lib/clubs/settings";
import { DAILY_JOB_HOUR } from "@/lib/clubs/schedule";

const OCCUPANCY_SCRIPT = "scripts/add-court-occupancy-hours.sql";

const COLUMNS = `
  id, name, short_name, logo_url, primary_color, accent_color, on_primary_color,
  timezone, open_time, close_time, occupancy_start_time, occupancy_end_time,
  slot_duration_minutes, overnight_slot, fixed_weekdays,
  class_player_limit, registration_discount_percent,
  module_reservations, module_classes, module_tournaments, module_packs, module_buffet,
  auto_daily_closure, daily_closure_hour, auto_reservation_week,
  reservation_week_weekday, reservation_week_hour
`;

const COLUMNS_WITHOUT_OCCUPANCY = COLUMNS
  .replace("occupancy_start_time, occupancy_end_time,\n", "");

function missingOccupancyColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /occupancy_(start|end)_time/i.test(error.message ?? "");
}

function httpError(error: unknown): NextResponse | null {
  if (error instanceof ClubContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

function toSettings(row: Record<string, unknown>): ClubSettings {
  return {
    id: Number(row.id),
    name: String(row.name),
    short_name: String(row.short_name),
    logo_url: row.logo_url == null ? null : String(row.logo_url),
    primary_color: String(row.primary_color),
    accent_color: String(row.accent_color),
    on_primary_color: String(row.on_primary_color),
    timezone: String(row.timezone),
    open_time: clockOf(row.open_time),
    close_time: clockOf(row.close_time),
    occupancy_start_time: clockOf(row.occupancy_start_time) || clockOf(row.open_time),
    occupancy_end_time: clockOf(row.occupancy_end_time) || clockOf(row.close_time),
    slot_duration_minutes: Number(row.slot_duration_minutes),
    overnight_slot: Boolean(row.overnight_slot),
    fixed_weekdays: Array.isArray(row.fixed_weekdays) ? row.fixed_weekdays.map(Number) : [],
    class_player_limit: Number(row.class_player_limit),
    registration_discount_percent: Number(row.registration_discount_percent),
    module_reservations: Boolean(row.module_reservations),
    module_classes: Boolean(row.module_classes),
    module_tournaments: Boolean(row.module_tournaments),
    module_packs: Boolean(row.module_packs),
    module_buffet: Boolean(row.module_buffet),
    auto_daily_closure: Boolean(row.auto_daily_closure),
    daily_closure_hour: DAILY_JOB_HOUR,
    auto_reservation_week: Boolean(row.auto_reservation_week),
    reservation_week_weekday: Number(row.reservation_week_weekday),
    reservation_week_hour: Number(row.reservation_week_hour),
  };
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, user.id);
    const loaded = await service.from("clubs").select(COLUMNS).eq("id", clubId).maybeSingle();
    if (loaded.error && missingOccupancyColumn(loaded.error)) {
      const plain = await service.from("clubs").select(COLUMNS_WITHOUT_OCCUPANCY).eq("id", clubId).maybeSingle();
      if (plain.error) return NextResponse.json({ error: plain.error.message }, { status: 500 });
      if (!plain.data) return NextResponse.json({ error: "No se encontró el complejo" }, { status: 404 });
      return NextResponse.json(toSettings(plain.data as unknown as Record<string, unknown>));
    }
    if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 });
    if (!loaded.data) return NextResponse.json({ error: "No se encontró el complejo" }, { status: 404 });
    return NextResponse.json(toSettings(loaded.data));
  } catch (error) {
    return httpError(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const parsed = parseClubSettings(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const { data, error } = await service
      .from("clubs")
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq("id", clubId)
      .select(COLUMNS)
      .maybeSingle();
    if (error && missingOccupancyColumn(error)) {
      return NextResponse.json({ error: `Falta aplicar ${OCCUPANCY_SCRIPT}` }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No se encontró el complejo" }, { status: 404 });
    return NextResponse.json(toSettings(data));
  } catch (error) {
    return httpError(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
