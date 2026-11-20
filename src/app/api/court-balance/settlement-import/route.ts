export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { createServiceClient } from "@/lib/supabase/service";
import {
  CredentialsKeyError,
  decryptAccessToken,
  loadCredentialsKey,
} from "@/lib/finance/credentials";
import { isCourtPaymentScope } from "@/lib/finance/payment-credentials";
import {
  downloadSettlementReport,
  listSettlementReports,
  MercadoPagoError,
  type MpSettlementReport,
} from "@/lib/finance/mercadopago-settlement";
import { settlementInserts, parseSettlementCsv } from "@/lib/finance/settlement-rows";

const SCRIPT = "scripts/add-mp-settlement-rows.sql";
const FLAG_SCRIPT = "scripts/add-payment-method-mercadopago.sql";
const CHUNK = 200;

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /mp_settlement_/i.test(error.message ?? "");
}

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

async function knownFileNames(clubId: number, paymentMethodId: number): Promise<Set<string>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mp_settlement_reports")
    .select("file_name")
    .eq("club_id", clubId)
    .eq("payment_method_id", paymentMethodId);
  if (missingTable(error)) {
    const setup = new CredentialsKeyError(`Falta aplicar ${SCRIPT}`);
    throw setup;
  }
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => String(row.file_name)));
}

async function knownFingerprints(clubId: number, paymentMethodId: number): Promise<Set<string>> {
  const service = createServiceClient();
  const found = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await service
      .from("mp_settlement_rows")
      .select("row_fingerprint")
      .eq("club_id", clubId)
      .eq("payment_method_id", paymentMethodId)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) found.add(String(row.row_fingerprint));
    if (!data || data.length < page) break;
  }
  return found;
}

async function insertRows(
  clubId: number,
  paymentMethodId: number,
  reportId: number,
  rows: ReturnType<typeof settlementInserts>["insert"],
) {
  const service = createServiceClient();
  for (let index = 0; index < rows.length; index += CHUNK) {
    const chunk = rows.slice(index, index + CHUNK).map((row) => ({
      club_id: clubId,
      payment_method_id: paymentMethodId,
      report_id: reportId,
      source_id: row.sourceId,
      payment_method_type: row.paymentMethodType,
      transaction_type: row.transactionType,
      transaction_amount: row.transactionAmount,
      transaction_date: row.transactionDate,
      fee_amount: row.feeAmount,
      settlement_date: row.settlementDate,
      real_amount: row.realAmount,
      taxes_amount: row.taxesAmount,
      business_unit: row.businessUnit,
      sub_unit: row.subUnit,
      money_release_date: row.moneyReleaseDate,
      row_fingerprint: row.fingerprint,
      payload: row.payload,
    }));
    const { error } = await service.from("mp_settlement_rows").insert(chunk);
    if (error) throw new Error(error.message);
  }
}

async function importFile(
  clubId: number,
  paymentMethodId: number,
  userId: string,
  report: MpSettlementReport,
  csv: string,
  fingerprints: Set<string>,
) {
  const service = createServiceClient();
  const planned = settlementInserts(parseSettlementCsv(csv), fingerprints);
  const { data, error } = await service
    .from("mp_settlement_reports")
    .insert({
      club_id: clubId,
      payment_method_id: paymentMethodId,
      mp_report_id: report.id,
      file_name: report.fileName,
      begin_date: report.beginDate,
      end_date: report.endDate,
      created_from: report.createdFrom,
      user_uid: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const reportId = Number(data.id);
  try {
    await insertRows(clubId, paymentMethodId, reportId, planned.insert);
  } catch (error) {
    await service.from("mp_settlement_rows").delete().eq("report_id", reportId);
    await service.from("mp_settlement_reports").delete().eq("id", reportId);
    throw error;
  }
  for (const row of planned.insert) fingerprints.add(row.fingerprint);
  return planned;
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("finance.manage");
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => null)) as { paymentMethodId?: unknown } | null;
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
    const reports = await listSettlementReports(token);
    const known = await knownFileNames(clubId, paymentMethodId);
    const fingerprints = await knownFingerprints(clubId, paymentMethodId);
    let importedFiles = 0;
    let insertedRows = 0;
    let skippedRows = 0;

    for (const report of reports) {
      if (known.has(report.fileName)) continue;
      const csv = await downloadSettlementReport(token, report.fileName);
      const planned = await importFile(clubId, paymentMethodId, auth.userId, report, csv, fingerprints);
      known.add(report.fileName);
      importedFiles += 1;
      insertedRows += planned.insert.length;
      skippedRows += planned.skipped;
    }

    return NextResponse.json({ importedFiles, insertedRows, skippedRows });
  } catch (error) {
    return failure(error);
  }
}
