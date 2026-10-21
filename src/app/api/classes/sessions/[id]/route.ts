export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  return withClasses("PATCH /classes/sessions/[id]", async (repos) => {
    const body = await request.json();
    const status = body.status === "cancelled" || body.status === "scheduled" ? body.status : undefined;
    await repos.classes.updateSession(idParam(params.id), {
      courtId: body.courtId !== undefined || body.court_id !== undefined ? Number(body.courtId ?? body.court_id) : undefined,
      status,
      reset: Boolean(body.reset),
    });
    return NextResponse.json({ ok: true });
  });
}
