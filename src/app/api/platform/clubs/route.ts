export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PlatformError, requirePlatformAdmin } from "@/lib/clubs/platform";
import { ClubAltaError, createClub } from "@/lib/clubs/create-club";
import { parseClubAlta } from "@/lib/clubs/parse-club-alta";

export async function GET() {
  try {
    const { userId } = await requirePlatformAdmin();
    const service = createServiceClient();
    const { data: admin, error: adminError } = await service
      .from("platform_admins")
      .select("active_club_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminError) {
      const missing = adminError.code === "42703" || /active_club_id/i.test(adminError.message);
      return NextResponse.json(
        { error: missing ? "Falta aplicar scripts/add-club-alta.sql en la base." : adminError.message },
        { status: missing ? 503 : 500 }
      );
    }

    const { data, error } = await service
      .from("clubs")
      .select("id, name, short_name, is_active")
      .order("id", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      activeClubId: admin?.active_club_id ?? null,
      clubs: data ?? [],
    });
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

export async function POST(request: Request) {
  try {
    const { userId } = await requirePlatformAdmin();
    const parsed = parseClubAlta(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const created = await createClub(createServiceClient(), parsed.value, userId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformError || error instanceof ClubAltaError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
