export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

export async function GET(request: Request) {
  try {
    const repos = await createRepositories();
    const url = new URL(request.url);
    if (url.searchParams.get("positive") === "1") {
      const balances = await repos.slotCredits.positiveBalances();
      return NextResponse.json({ balances });
    }

    const playerIds = (url.searchParams.get("playerIds") ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);

    const balances = await repos.slotCredits.balances(playerIds);
    return NextResponse.json({ balances });
  } catch (error) {
    console.error("GET /slot-credits error:", error);
    return slotCreditHttpError(error, "No se pudieron cargar los créditos");
  }
}
