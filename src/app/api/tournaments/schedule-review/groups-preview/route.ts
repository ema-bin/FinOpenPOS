export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";

export async function GET(req: Request) {
  try {
    const repos = await createRepositories();
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids")?.trim();

    let tournamentIds: number[] = [];
    if (idsParam) {
      tournamentIds = idsParam
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else {
      const supabase = createClient();
      const { data: rows, error } = await supabase
        .from("tournaments")
        .select("id")
        .eq("status", "schedule_review")
        .order("id", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      tournamentIds = (rows ?? []).map((r) => r.id);
    }

    if (tournamentIds.length === 0) {
      return NextResponse.json({ tournaments: [] });
    }

    const tournaments = [];
    for (const id of tournamentIds) {
      const tournament = await repos.tournaments.findById(id);
      if (!tournament || tournament.status !== "schedule_review") continue;

      const groupsData = await repos.tournamentGroups.getGroupsData(id);
      if (!groupsData.groups.length) continue;

      tournaments.push({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        match_duration: tournament.match_duration,
        groups: groupsData.groups,
        matches: groupsData.matches,
        tournamentGroupSlots: groupsData.tournamentGroupSlots,
        groupScheduleCourtIds: groupsData.groupScheduleCourtIds,
      });
    }

    return NextResponse.json({ tournaments });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET schedule-review groups-preview error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
