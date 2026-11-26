export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { loadClubSchedule } from "@/lib/clubs/load-club";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CredentialsKeyError,
  decryptAccessToken,
  loadCredentialsKey,
} from "@/lib/finance/credentials";
import { MercadoPagoError, requestSettlementReport } from "@/lib/finance/mercadopago-settlement";
import { isCourtPaymentScope } from "@/lib/finance/payment-credentials";
import { settlementRangeWindow, settlementRequestWindow } from "@/lib/finance/settlement-window";

const FLAG_SCRIPT = "scripts/add-payment-method-mercadopago.sql";

function missingFlag(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /is_mercadopago/i.test(error.message ?? "");
}

function failure(error: unknown) {
  if (error instanceof ClubContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof CredentialsKeyError || error instanceof MercadoPagoError) {
    return NextResponse.json({ error: error.message }, { status: error instanceof CredentialsKeyError ? 503 : 502 });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const config = await requirePermission("users.manage");
    const auth = config.ok || config.response.status === 401
      ? config
      : await requirePermission("finance.manage");
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => null)) as {
      paymentMethodId?: unknown;
      from?: unknown;
      to?: unknown;
    } | null;
    const paymentMethodId = Number(body?.paymentMethodId);
    if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
      return NextResponse.json({ error: "Elegí un medio de pago." }, { status: 400 });
    }

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const method = await service
      .from("payment_methods")
      .select("id, scope, is_mercadopago")
      .eq("id", paymentMethodId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (missingFlag(method.error)) {
      return NextResponse.json({ error: `Falta aplicar ${FLAG_SCRIPT}` }, { status: 503 });
    }
    if (method.error) return NextResponse.json({ error: method.error.message }, { status: 500 });
    if (!method.data) {
      return NextResponse.json({ error: "Ese medio de pago no está en este complejo." }, { status: 404 });
    }
    if (!isCourtPaymentScope(String(method.data.scope)) || method.data.is_mercadopago !== true) {
      return NextResponse.json({ error: "Ese medio no está marcado como Mercado Pago." }, { status: 400 });
    }

    const credential = await service
      .from("payment_method_credentials")
      .select("token_ciphertext, token_iv, token_tag, key_version")
      .eq("club_id", clubId)
      .eq("payment_method_id", paymentMethodId)
      .eq("provider", "mercadopago")
      .maybeSingle();
    if (credential.error) return NextResponse.json({ error: credential.error.message }, { status: 500 });
    if (!credential.data) {
      return NextResponse.json({ error: "Ese medio no tiene access token." }, { status: 400 });
    }

    const token = decryptAccessToken(
      {
        ciphertext: String(credential.data.token_ciphertext),
        iv: String(credential.data.token_iv),
        tag: String(credential.data.token_tag),
        keyVersion: Number(credential.data.key_version),
      },
      loadCredentialsKey(),
    );
    const club = await loadClubSchedule(service, clubId);
    const hasRange = body?.from != null || body?.to != null;
    const window = !hasRange
      ? settlementRequestWindow(new Date(), club.timezone)
      : typeof body?.from === "string" && typeof body?.to === "string"
        ? settlementRangeWindow(body.from, body.to, club.timezone)
        : { ok: false as const, error: "Elegí un desde y un hasta." };
    if ("ok" in window && !window.ok) {
      return NextResponse.json({ error: window.error }, { status: 400 });
    }
    const range = "ok" in window ? window.window : window;
    const report = await requestSettlementReport(token, range.beginDate, range.endDate);
    return NextResponse.json({
      ...range,
      id: report.id,
      status: report.status,
      beginDate: report.beginDate ?? range.beginDate,
      endDate: report.endDate ?? range.endDate,
      fileName: report.fileName,
    });
  } catch (error) {
    return failure(error);
  }
}
