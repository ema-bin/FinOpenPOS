export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withClasses } from "@/lib/class-route";

export async function GET() {
  return withClasses("GET /classes/schedules", async (repos) => {
    const schedules = await repos.classes.listSchedules();
    return NextResponse.json(schedules);
  });
}

export async function POST(request: Request) {
  return withClasses("POST /classes/schedules", async (repos) => {
    const body = await request.json();
    const id = await repos.classes.createSchedule({
      professorId: Number(body.professorId ?? body.professor_id),
      courtId: Number(body.courtId ?? body.court_id),
      weekday: Number(body.weekday),
      startTime: String(body.startTime ?? body.start_time ?? ""),
      name: body.name ?? null,
      playerIds: Array.isArray(body.playerIds)
        ? body.playerIds.map((playerId: unknown) => Number(playerId)).filter((playerId: number) => playerId > 0)
        : [],
    });
    return NextResponse.json({ id }, { status: 201 });
  });
}
