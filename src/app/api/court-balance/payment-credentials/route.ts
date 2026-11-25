export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assertAccessToken,
  CredentialsKeyError,
  encryptAccessToken,
  loadCredentialsKey,
  TokenFormatError,
} from "@/lib/finance/credentials";
import {
  isCourtPaymentScope,
  paymentCredentialStatus,
  type CourtPaymentMethodRow,
  type CredentialStamp,
} from "@/lib/finance/payment-credentials";

const SCRIPT = "scripts/add-payment-method-credentials.sql";
const FLAG_SCRIPT = "scripts/add-payment-method-mercadopago.sql";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /payment_method_credentials/i.test(error.message ?? "")
  );
}

function failure(error: unknown) {
  if (error instanceof ClubContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof CredentialsKeyError || error instanceof MercadoPagoSetupError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof TokenFormatError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

function missingMercadoPagoColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /is_mercadopago/i.test(error.message ?? "");
}

class MercadoPagoSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoSetupError";
  }
}

async function allowCredential(level: "read" | "write") {
  const config = await requirePermission("users.manage", level);
  if (config.ok || config.response.status === 401) return config;
  return requirePermission("finance.manage", level);
}

function paymentMethodIdOf(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

async function courtMethod(clubId: number, paymentMethodId: number) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("payment_methods")
    .select("id, scope, club_id, is_mercadopago")
    .eq("id", paymentMethodId)
    .eq("club_id", clubId)
    .maybeSingle();
  if (missingMercadoPagoColumn(error)) {
    throw new MercadoPagoSetupError(`Falta aplicar ${FLAG_SCRIPT}`);
  }
  if (error) throw new Error(error.message);
  return data as { id: number; scope: string; club_id: number; is_mercadopago: boolean } | null;
}

export async function GET() {
  try {
    const auth = await allowCredential("read");
    if (!auth.ok) return auth.response;
    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const methods = await service
      .from("payment_methods")
      .select("id, name, scope, is_active, is_mercadopago")
      .eq("club_id", clubId)
      .in("scope", ["COURT", "BOTH"])
      .order("name", { ascending: true });
    if (missingMercadoPagoColumn(methods.error)) {
      return NextResponse.json({ error: `Falta aplicar ${FLAG_SCRIPT}` }, { status: 503 });
    }
    if (methods.error) return NextResponse.json({ error: methods.error.message }, { status: 500 });

    const credentials = await service
      .from("payment_method_credentials")
      .select("payment_method_id, updated_at")
      .eq("club_id", clubId)
      .eq("provider", "mercadopago");
    if (missingTable(credentials.error)) {
      return NextResponse.json({ error: `Falta aplicar ${SCRIPT}` }, { status: 503 });
    }
    if (credentials.error) return NextResponse.json({ error: credentials.error.message }, { status: 500 });

    return NextResponse.json({
      methods: paymentCredentialStatus(
        (methods.data ?? []) as CourtPaymentMethodRow[],
        (credentials.data ?? []) as CredentialStamp[],
      ),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await allowCredential("write");
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => null)) as {
      paymentMethodId?: unknown;
      accessToken?: unknown;
    } | null;
    const paymentMethodId = paymentMethodIdOf(body?.paymentMethodId);
    if (!paymentMethodId) {
      return NextResponse.json({ error: "Elegí un medio de pago." }, { status: 400 });
    }
    const accessToken = assertAccessToken(body?.accessToken);

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const method = await courtMethod(clubId, paymentMethodId);
    if (!method) {
      return NextResponse.json({ error: "Ese medio de pago no está en este complejo." }, { status: 404 });
    }
    if (!isCourtPaymentScope(method.scope)) {
      return NextResponse.json({ error: "Ese medio no se usa en canchas." }, { status: 400 });
    }
    if (!method.is_mercadopago) {
      return NextResponse.json({ error: "Ese medio no está marcado como Mercado Pago." }, { status: 400 });
    }

    const secret = encryptAccessToken(accessToken, loadCredentialsKey());
    const updatedAt = new Date().toISOString();
    const { error } = await service.from("payment_method_credentials").upsert(
      {
        club_id: clubId,
        payment_method_id: paymentMethodId,
        provider: "mercadopago",
        token_ciphertext: secret.ciphertext,
        token_iv: secret.iv,
        token_tag: secret.tag,
        key_version: secret.keyVersion,
        user_uid: auth.userId,
        updated_at: updatedAt,
      },
      { onConflict: "payment_method_id,provider" },
    );
    if (missingTable(error)) {
      return NextResponse.json({ error: `Falta aplicar ${SCRIPT}` }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ paymentMethodId, configured: true, updatedAt });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await allowCredential("write");
    if (!auth.ok) return auth.response;
    const paymentMethodId = paymentMethodIdOf(new URL(request.url).searchParams.get("paymentMethodId"));
    if (!paymentMethodId) {
      return NextResponse.json({ error: "Elegí un medio de pago." }, { status: 400 });
    }

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const method = await courtMethod(clubId, paymentMethodId);
    if (!method) {
      return NextResponse.json({ error: "Ese medio de pago no está en este complejo." }, { status: 404 });
    }
    if (!method.is_mercadopago) {
      return NextResponse.json({ error: "Ese medio no está marcado como Mercado Pago." }, { status: 400 });
    }

    const { error } = await service
      .from("payment_method_credentials")
      .delete()
      .eq("club_id", clubId)
      .eq("payment_method_id", paymentMethodId)
      .eq("provider", "mercadopago");
    if (missingTable(error)) {
      return NextResponse.json({ error: `Falta aplicar ${SCRIPT}` }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ paymentMethodId, configured: false, updatedAt: null });
  } catch (error) {
    return failure(error);
  }
}
