export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

export async function POST(request: Request) {
  return withClasses("POST /classes/charges/close", async (repos) => {
    const body = await request.json();
    const month = String(body.yearMonth ?? body.year_month ?? body.month ?? "");
    if (!month) throw new ClassRequestError("Elegí el mes");
    const professorId = Number(body.professorId ?? body.professor_id);
    if (!Number.isInteger(professorId) || professorId <= 0) throw new ClassRequestError("Elegí un profesor");
    const closed = body.closed !== false;
    await repos.classes.setMonthClosed(month, professorId, closed);
    return NextResponse.json({ closed, professorId });
  });
}
