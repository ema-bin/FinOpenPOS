export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const repos = await createRepositories();
    const definitionId = Number(params.id);
    if (!Number.isInteger(definitionId) || definitionId <= 0) {
      return NextResponse.json({ error: "No se encontró el pack" }, { status: 400 });
    }
    const body = await request.json();
    const credits = Number(body.credits);
    const price = body.price == null || body.price === "" ? 0 : Number(body.price);
    if (!Number.isInteger(credits) || credits <= 0) {
      return NextResponse.json(
        { error: "Los turnos del pack tienen que ser mayores a cero" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { error: "El precio del pack no puede ser negativo" },
        { status: 400 }
      );
    }
    const id = await repos.slotCredits.saveDefinition({
      id: definitionId,
      name: String(body.name ?? ""),
      credits,
      price,
      isActive: body.is_active !== false,
    });
    return NextResponse.json({ id });
  } catch (error) {
    console.error("PATCH /slot-pack-definitions/[id] error:", error);
    return slotCreditHttpError(error, "No se pudo guardar el pack");
  }
}
