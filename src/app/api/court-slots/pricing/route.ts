export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const repos = await createRepositories();
    const url = new URL(request.url);
    const on = url.searchParams.get("on");
    const history = url.searchParams.get("history") === "1";

    if (history) {
      const courtId = Number(url.searchParams.get("courtId"));
      if (!Number.isInteger(courtId) || courtId <= 0) {
        return NextResponse.json({ error: "Invalid court ID" }, { status: 400 });
      }
      return NextResponse.json(await repos.courtPricing.findHistory(courtId));
    }

    if (on) {
      if (!DATE.test(on)) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
      return NextResponse.json(await repos.courtPricing.findCovering(on));
    }

    const pricing = await repos.courtPricing.findAll();
    return NextResponse.json(pricing);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /court-slots/pricing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
