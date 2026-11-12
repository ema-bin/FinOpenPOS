export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const repos = await createRepositories();
    const url = new URL(request.url);
    const from = (url.searchParams.get("from") ?? "").trim();
    const to = (url.searchParams.get("to") ?? "").trim();
    if ((from && !DAY.test(from)) || (to && !DAY.test(to))) {
      return NextResponse.json({ error: "La fecha no es válida" }, { status: 400 });
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: "La fecha desde no puede ser posterior a hasta" }, { status: 400 });
    }
    const sales = await repos.slotCredits.listSales(from || null, to || null);
    return NextResponse.json(sales);
  } catch (error) {
    console.error("GET /slot-packs/sales error:", error);
    return slotCreditHttpError(error, "No se pudieron cargar las ventas");
  }
}
