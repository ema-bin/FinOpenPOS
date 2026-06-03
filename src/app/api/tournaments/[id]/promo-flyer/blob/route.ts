export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";

type RouteParams = { params: { id: string } };

/** Devuelve el flier del torneo (mismo origen) para copiar al portapapeles sin CORS. */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const repos = await createRepositories();
    const tournamentId = Number(params.id);
    if (!Number.isInteger(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament?.promo_flyer_url?.trim()) {
      return NextResponse.json({ error: "No hay flier subido" }, { status: 404 });
    }

    const imageRes = await fetch(tournament.promo_flyer_url);
    if (!imageRes.ok) {
      return NextResponse.json(
        { error: "No se pudo leer el flier desde el almacenamiento" },
        { status: 502 }
      );
    }

    const bytes = await imageRes.arrayBuffer();
    const contentType =
      imageRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET promo-flyer/blob error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
