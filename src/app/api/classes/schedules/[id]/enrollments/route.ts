export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  return withClasses("POST /classes/schedules/[id]/enrollments", async (repos) => {
    const body = await request.json();
    const playerId = Number(body.playerId ?? body.player_id);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      throw new ClassRequestError("Elegí un jugador");
    }
    await repos.classes.addEnrollment(idParam(params.id), playerId);
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
