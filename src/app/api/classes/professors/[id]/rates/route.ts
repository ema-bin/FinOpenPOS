export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  return withClasses("POST /classes/professors/[id]/rates", async (repos) => {
    const body = await request.json();
    await repos.classes.saveRate(
      idParam(params.id),
      Number(body.weeklyCount ?? body.weekly_count),
      Number(body.monthlyAmount ?? body.monthly_amount)
    );
    return NextResponse.json({ ok: true });
  });
}
