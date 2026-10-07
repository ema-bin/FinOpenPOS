export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { parseTemplateInput } from "@/lib/whatsapp-message-variants";

type RouteParams = { params: { id: string } };

function errorResponse(error: unknown, context: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(context, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal server error" },
    { status: 500 }
  );
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const id = parseId(params.id);
    if (id == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const parsed = parseTemplateInput(await request.json().catch(() => ({})), {
      partial: true,
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const repos = await createRepositories();
    const updated = await repos.whatsappMessageTemplates.update(id, parsed.value);
    if (!updated) {
      return NextResponse.json({ error: "Variante no encontrada" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error, "PATCH /whatsapp-message-templates/[id] error:");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const id = parseId(params.id);
    if (id == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const repos = await createRepositories();
    await repos.whatsappMessageTemplates.delete(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, "DELETE /whatsapp-message-templates/[id] error:");
  }
}
