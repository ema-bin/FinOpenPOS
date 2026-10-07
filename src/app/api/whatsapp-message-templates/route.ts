export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRepositories } from "@/lib/repository-factory";
import { isWhatsAppTemplateKind } from "@/models/db/whatsapp-message-template";
import { parseTemplateInput } from "@/lib/whatsapp-message-variants";

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

export async function GET(request: Request) {
  try {
    const kind = new URL(request.url).searchParams.get("kind");
    if (!isWhatsAppTemplateKind(kind)) {
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    }
    const repos = await createRepositories();
    const templates = await repos.whatsappMessageTemplates.findByKind(kind);
    return NextResponse.json(templates);
  } catch (error) {
    return errorResponse(error, "GET /whatsapp-message-templates error:");
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    if (!isWhatsAppTemplateKind(raw?.kind)) {
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    }
    const parsed = parseTemplateInput(raw, { partial: false });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const repos = await createRepositories();
    const created = await repos.whatsappMessageTemplates.create({
      kind: raw.kind,
      name: parsed.value.name!,
      body: parsed.value.body!,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error, "POST /whatsapp-message-templates error:");
  }
}
