export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

export async function GET() {
  try {
    const repos = await createRepositories();
    const players = await repos.slotCredits.listPlayers();
    return NextResponse.json(players);
  } catch (error) {
    console.error("GET /slot-packs error:", error);
    return slotCreditHttpError(error, "No se pudieron cargar los packs");
  }
}

export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const body = await request.json();
    const playerId = Number(body.player_id);
    const definitionId = Number(body.definition_id);
    const amountPaid = body.amount_paid == null || body.amount_paid === "" ? 0 : Number(body.amount_paid);
    const paymentMethodId = Number(body.payment_method_id);
    const soldAt = String(body.sold_at ?? "").trim();

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json({ error: "Elegí un jugador" }, { status: 400 });
    }
    if (!Number.isInteger(definitionId) || definitionId <= 0) {
      return NextResponse.json({ error: "Elegí un pack" }, { status: 400 });
    }
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      return NextResponse.json({ error: "El importe del pack no puede ser negativo" }, { status: 400 });
    }
    if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
      return NextResponse.json({ error: "Elegí cómo lo pagó" }, { status: 400 });
    }
    if (soldAt && !/^\d{4}-\d{2}-\d{2}$/.test(soldAt)) {
      return NextResponse.json({ error: "La fecha del pack no es válida" }, { status: 400 });
    }

    const id = await repos.slotCredits.grant({
      playerId,
      definitionId,
      amountPaid,
      paymentMethodId,
      soldAt: soldAt || new Date().toISOString().slice(0, 10),
      notes: body.notes == null ? null : String(body.notes),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("POST /slot-packs error:", error);
    return slotCreditHttpError(error, "No se pudo asignar el pack");
  }
}
