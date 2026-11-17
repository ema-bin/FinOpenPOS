import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { isDigitalSignageEnabledServer } from "@/lib/signage-flag";

export class SignageError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function signageUnavailable() {
  return NextResponse.json({ error: "No disponible" }, { status: 404 });
}

export function isMissingSignageTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /signage_/i.test(error.message ?? "");
}

export function signageHttpError(error: unknown): NextResponse {
  if (error instanceof SignageError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (typeof error === "object" && error && isMissingSignageTable(error as { code?: string; message?: string })) {
    return NextResponse.json({ error: "Falta aplicar scripts/add-signage.sql en la base." }, { status: 503 });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  if (/signage_/i.test(message) && /schema cache|does not exist|relation/i.test(message)) {
    return NextResponse.json({ error: "Falta aplicar scripts/add-signage.sql en la base." }, { status: 503 });
  }
  if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function signageContext(level: "read" | "write" = "write"): Promise<
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  if (!isDigitalSignageEnabledServer()) return { ok: false, response: signageUnavailable() };
  const auth = await requirePermission("signage.manage", level);
  if (!auth.ok) return auth;
  return { ok: true, userId: auth.userId, supabase: createClient() };
}
