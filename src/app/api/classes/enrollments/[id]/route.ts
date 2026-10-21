export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";

type Params = { params: { id: string } };

export async function DELETE(_request: Request, { params }: Params) {
  return withClasses("DELETE /classes/enrollments/[id]", async (repos) => {
    await repos.classes.endEnrollment(idParam(params.id));
    return NextResponse.json({ ok: true });
  });
}
