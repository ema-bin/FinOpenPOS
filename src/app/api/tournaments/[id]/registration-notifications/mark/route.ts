export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";

type RouteParams = { params: { id: string } };

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const repos = await createRepositories();
    const tournamentId = Number(params.id);
    if (!Number.isInteger(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const playerId = Number(body.player_id);
    const notified = body.notified !== false;

    if (!Number.isInteger(playerId)) {
      return NextResponse.json({ error: "player_id is required" }, { status: 400 });
    }

    const tournament = await repos.tournaments.findById(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (notified) {
      await repos.tournamentRegistrationNotified.markNotified(
        tournamentId,
        playerId
      );
    } else {
      await repos.tournamentRegistrationNotified.unmarkNotified(
        tournamentId,
        playerId
      );
    }

    return NextResponse.json({ ok: true, player_id: playerId, notified });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST registration-notifications/mark error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
