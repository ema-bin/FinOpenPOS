export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import {
  findPlayerDuplicateSuggestions,
  hasEnoughDuplicateCheckInput,
} from "@/lib/player-duplicate-suggestions";

export async function GET(request: Request) {
  try {
    const repos = await createRepositories();
    const url = new URL(request.url);

    const first_name = String(url.searchParams.get("first_name") ?? "").trim();
    const last_name = String(url.searchParams.get("last_name") ?? "").trim();
    const phone = String(url.searchParams.get("phone") ?? "").trim();
    const excludeRaw = url.searchParams.get("exclude_id");
    const excludePlayerId =
      excludeRaw != null && excludeRaw !== "" ? Number(excludeRaw) : null;

    const input = { first_name, last_name, phone };

    if (!hasEnoughDuplicateCheckInput(input)) {
      return NextResponse.json({ suggestions: [] });
    }

    const players = await repos.players.findAll({ status: "all" });
    const suggestions = findPlayerDuplicateSuggestions(
      input,
      players.map((player) => ({
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        phone: player.phone,
        status: player.status,
        city: player.city,
      })),
      {
        excludePlayerId:
          excludePlayerId != null && !Number.isNaN(excludePlayerId)
            ? excludePlayerId
            : null,
      }
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /players/duplicate-suggestions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
