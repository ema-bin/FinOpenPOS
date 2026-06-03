export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { supabaseStorageService } from "@/services/supabase-storage.service";

type RouteParams = { params: { id: string } };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const repos = await createRepositories();
    const tournamentId = Number(params.id);
    if (!Number.isInteger(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "La imagen no puede superar 8 MB" },
        { status: 400 }
      );
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato no válido. Usá PNG, JPG o WebP." },
        { status: 400 }
      );
    }

    const url = await supabaseStorageService.uploadTournamentPromoFlyer(
      file,
      tournamentId
    );
    const updated = await repos.tournaments.update(tournamentId, {
      promo_flyer_url: url,
    });

    return NextResponse.json({ url, promo_flyer_url: url, tournament: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /tournaments/:id/promo-flyer error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error al subir el flier",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const repos = await createRepositories();
    const tournamentId = Number(params.id);
    if (!Number.isInteger(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    await supabaseStorageService.removeTournamentPromoFlyers(tournamentId);

    const updated = await repos.tournaments.update(tournamentId, {
      promo_flyer_url: null,
    });

    return NextResponse.json({ ok: true, tournament: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /tournaments/:id/promo-flyer error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
