export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { slotCreditHttpError } from "@/lib/slot-credit-rpc";

function readDefinition(body: {
  name?: unknown;
  credits?: unknown;
  price?: unknown;
  is_active?: unknown;
}) {
  const credits = Number(body.credits);
  const price = body.price == null || body.price === "" ? 0 : Number(body.price);
  if (!Number.isInteger(credits) || credits <= 0) {
    return { error: "Los turnos del pack tienen que ser mayores a cero" as const };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: "El precio del pack no puede ser negativo" as const };
  }
  return {
    name: String(body.name ?? ""),
    credits,
    price,
    isActive: body.is_active !== false,
  };
}

export async function GET() {
  try {
    const repos = await createRepositories();
    const definitions = await repos.slotCredits.listDefinitions();
    return NextResponse.json(definitions);
  } catch (error) {
    console.error("GET /slot-pack-definitions error:", error);
    return slotCreditHttpError(error, "No se pudieron cargar los packs");
  }
}

export async function POST(request: Request) {
  try {
    const repos = await createRepositories();
    const parsed = readDefinition(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const id = await repos.slotCredits.saveDefinition({ id: null, ...parsed });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("POST /slot-pack-definitions error:", error);
    return slotCreditHttpError(error, "No se pudo guardar el pack");
  }
}
