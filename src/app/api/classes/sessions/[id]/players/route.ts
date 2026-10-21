export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

type Params = { params: { id: string } };

export async function PUT(request: Request, { params }: Params) {
  return withClasses("PUT /classes/sessions/[id]/players", async (repos) => {
    const body = await request.json();
    const raw = body.playerIds ?? body.player_ids;
    if (!Array.isArray(raw)) throw new ClassRequestError("Falta la lista de integrantes");
    const playerIds = raw.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
    await repos.classes.setSessionPlayers(idParam(params.id), playerIds);
    return NextResponse.json({ ok: true });
  });
}
