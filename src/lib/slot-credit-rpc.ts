import { NextResponse } from "next/server";

export class SlotCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotCreditError";
  }
}

export function throwSlotRpcError(error: { message?: string } | null): void {
  if (!error) return;
  const raw = error.message ?? "Error";
  const marker = "SLOT_CREDIT:";
  const index = raw.indexOf(marker);
  if (index >= 0) {
    const message = raw.slice(index + marker.length).split("\n")[0].trim();
    throw new SlotCreditError(message || "No se pudo actualizar los créditos");
  }
  if (raw.includes("Court slot not found")) {
    throw new Error("Court slot not found");
  }
  if (
    raw.includes("save_court_slot") ||
    raw.includes("grant_slot_pack") ||
    raw.includes("adjust_slot_credits") ||
    raw.includes("delete_court_slot") ||
    raw.includes("schema cache")
  ) {
    throw new Error("Falta aplicar el script de packs de turnos en la base.");
  }
  throw new Error(raw);
}

export function slotCreditHttpError(error: unknown, fallback: string) {
  if (error instanceof SlotCreditError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "Court slot not found") {
    return NextResponse.json({ error: "Court slot not found" }, { status: 404 });
  }
  const message = error instanceof Error && error.message ? error.message : fallback;
  const status = message.startsWith("Falta aplicar el script") ? 503 : 500;
  return NextResponse.json({ error: message }, { status });
}
