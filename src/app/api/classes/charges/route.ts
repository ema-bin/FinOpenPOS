export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

export async function GET(request: Request) {
  return withClasses("GET /classes/charges", async (repos) => {
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const charges = await repos.classes.listCharges(month);
    const closedProfessorIds = await repos.classes.closedProfessorIds(month);
    return NextResponse.json({ charges, closedProfessorIds, missing: [] });
  });
}

export async function POST(request: Request) {
  return withClasses("POST /classes/charges", async (repos) => {
    const body = await request.json();
    const month = String(body.yearMonth ?? body.year_month ?? body.month ?? "");
    if (!month) throw new ClassRequestError("Elegí el mes");
    const result = await repos.classes.generateCharges(month);
    return NextResponse.json(result);
  });
}
