export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  return withClasses("PATCH /classes/schedules/[id]", async (repos) => {
    const body = await request.json();
    await repos.classes.updateSchedule(idParam(params.id), {
      professorId:
        body.professorId !== undefined || body.professor_id !== undefined
          ? Number(body.professorId ?? body.professor_id)
          : undefined,
      courtId:
        body.courtId !== undefined || body.court_id !== undefined
          ? Number(body.courtId ?? body.court_id)
          : undefined,
      weekday: body.weekday !== undefined ? Number(body.weekday) : undefined,
      startTime:
        body.startTime !== undefined || body.start_time !== undefined
          ? String(body.startTime ?? body.start_time)
          : undefined,
      name: body.name !== undefined ? body.name : undefined,
      isActive:
        body.isActive !== undefined || body.is_active !== undefined
          ? Boolean(body.isActive ?? body.is_active)
          : undefined,
    });
    return NextResponse.json({ ok: true });
  });
}
