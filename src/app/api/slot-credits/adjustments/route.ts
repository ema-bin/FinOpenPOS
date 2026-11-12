export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const body = await request.json();
    const playerId = Number(body.player_id);
    const delta = Number(body.delta);
    const reason = String(body.reason ?? "").trim();

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Elegí un jugador" }, { status: 400 });
    }
    if (!Number.isInteger(delta) || delta === 0) {
      return NextResponse.json({ error: "El ajuste tiene que cambiar el saldo" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "El motivo del ajuste es obligatorio" }, { status: 400 });
    }

    await repos.slotCredits.adjust(playerId, delta, reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /slot-credits/adjustments error:", error);
    return slotCreditHttpError(error, "No se pudo ajustar el saldo");
  }
}
