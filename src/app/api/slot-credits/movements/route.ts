export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

export async function GET(request: Request) {
  try {
    const repos = await createRepositories();
    const playerId = Number(new URL(request.url).searchParams.get("playerId"));
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Elegí un jugador" }, { status: 400 });
    }
    const movements = await repos.slotCredits.movements(playerId);
    return NextResponse.json(movements);
  } catch (error) {
    console.error("GET /slot-credits/movements error:", error);
    return slotCreditHttpError(error, "No se pudo cargar el historial");
  }
}
