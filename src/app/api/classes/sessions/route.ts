export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withClasses } from "@/lib/class-route";

export async function GET(request: Request) {
  return withClasses("GET /classes/sessions", async (repos) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? from;
    const sessions = await repos.classes.listSessions(from, to);
    return NextResponse.json(sessions);
  });
}
