export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PlatformError, requirePlatformAdmin } from "@/lib/clubs/platform";

export async function POST(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin();
    const body = (await request.json().catch(() => null)) as { clubId?: unknown } | null;
    const clubId = body?.clubId == null || body.clubId === "" ? null : Number(body.clubId);
    if (clubId !== null && (!Number.isInteger(clubId) || clubId <= 0)) {
      return NextResponse.json({ error: "Elegí un complejo" }, { status: 400 });
    }

    const service = createServiceClient();
    if (clubId !== null) {
      const { data: club, error } = await service
        .from("clubs")
        .select("id")
        .eq("id", clubId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!club) return NextResponse.json({ error: "Ese complejo no está activo" }, { status: 404 });
    }

    const { error } = await service
      .from("platform_admins")
      .update({ active_club_id: clubId })
      .eq("user_id", userId);
    if (error) {
      const missing = error.code === "42703" || /active_club_id/i.test(error.message);
      return NextResponse.json(
        { error: missing ? "Falta aplicar scripts/add-club-alta.sql en la base." : error.message },
        { status: missing ? 503 : 500 }
      );
    }
    return NextResponse.json({ activeClubId: clubId });
  } catch (error) {
    if (error instanceof PlatformError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
