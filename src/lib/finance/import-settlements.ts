import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CredentialsKeyError,
  decryptAccessToken,
  loadCredentialsKey,
} from "@/lib/finance/credentials";
import { isCourtPaymentScope } from "@/lib/finance/payment-credentials";
import {
  downloadSettlementReport,
  isSettlementCsvBody,
  isSettlementCsvName,
  listSettlementReports,
  type MpSettlementReport,
} from "@/lib/finance/mercadopago-settlement";
import { parseSettlementCsv, settlementInserts } from "@/lib/finance/settlement-rows";

const SCRIPT = "scripts/add-mp-settlement-rows.sql";
const CHUNK = 200;

export type SettlementImportCount = {
  paymentMethodId: number;
  importedFiles: number;
  insertedRows: number;
  skippedRows: number;
  skippedFiles: number;
  error?: string;
};

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /mp_settlement_/i.test(error.message ?? "");
}

async function knownFileNames(
  service: SupabaseClient,
  clubId: number,
  paymentMethodId: number,
): Promise<Set<string>> {
  const { data, error } = await service
    .from("mp_settlement_reports")
    .select("file_name")
    .eq("club_id", clubId)
    .eq("payment_method_id", paymentMethodId);
  if (missingTable(error)) throw new CredentialsKeyError(`Falta aplicar ${SCRIPT}`);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => String(row.file_name)));
}

async function knownFingerprints(
  service: SupabaseClient,
  clubId: number,
  paymentMethodId: number,
): Promise<Set<string>> {
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
  service: SupabaseClient,
  clubId: number,
  paymentMethodId: number,
  reportId: number,
  rows: ReturnType<typeof settlementInserts>["insert"],
) {
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

/** Baja los reportes de ese token que todavía no están guardados e inserta las filas nuevas. */
export async function importReadySettlements(
  service: SupabaseClient,
  input: { clubId: number; paymentMethodId: number; userId: string; token: string },
): Promise<Omit<SettlementImportCount, "error">> {
  const reports = await listSettlementReports(input.token);
  const known = await knownFileNames(service, input.clubId, input.paymentMethodId);
  const fingerprints = await knownFingerprints(service, input.clubId, input.paymentMethodId);
  let importedFiles = 0;
  let insertedRows = 0;
  let skippedRows = 0;
  let skippedFiles = 0;

  for (const report of reports) {
    if (known.has(report.fileName)) continue;
    if (!isSettlementCsvName(report.fileName)) {
      skippedFiles += 1;
      continue;
    }
    const csv = await downloadSettlementReport(input.token, report.fileName);
    if (!isSettlementCsvBody(csv)) {
      skippedFiles += 1;
      continue;
    }
    const planned = await saveReport(service, input, report, csv, fingerprints);
    known.add(report.fileName);
    importedFiles += 1;
    insertedRows += planned.insert.length;
    skippedRows += planned.skipped;
  }

  return {
    paymentMethodId: input.paymentMethodId,
    importedFiles,
    insertedRows,
    skippedRows,
    skippedFiles,
  };
}

async function saveReport(
  service: SupabaseClient,
  input: { clubId: number; paymentMethodId: number; userId: string },
  report: MpSettlementReport,
  csv: string,
  fingerprints: Set<string>,
) {
  const planned = settlementInserts(parseSettlementCsv(csv), fingerprints);
  const { data, error } = await service
    .from("mp_settlement_reports")
    .insert({
      club_id: input.clubId,
      payment_method_id: input.paymentMethodId,
      mp_report_id: report.id,
      file_name: report.fileName,
      begin_date: report.beginDate,
      end_date: report.endDate,
      created_from: report.createdFrom,
      user_uid: input.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const reportId = Number(data.id);
  try {
    await insertRows(service, input.clubId, input.paymentMethodId, reportId, planned.insert);
  } catch (error) {
    await service.from("mp_settlement_rows").delete().eq("report_id", reportId);
    await service.from("mp_settlement_reports").delete().eq("id", reportId);
    throw error;
  }
  for (const row of planned.insert) fingerprints.add(row.fingerprint);
  return planned;
}

/** Todos los medios de cancha marcados como Mercado Pago que ya tienen token. */
export async function importClubSettlements(
  service: SupabaseClient,
  clubId: number,
  userId: string,
): Promise<SettlementImportCount[]> {
  const methods = await service
    .from("payment_methods")
    .select("id, scope, is_mercadopago")
    .eq("club_id", clubId)
    .eq("is_mercadopago", true);
  if (methods.error) {
    if (methods.error.code === "42703" || /is_mercadopago/i.test(methods.error.message ?? "")) {
      return [{ paymentMethodId: 0, importedFiles: 0, insertedRows: 0, skippedRows: 0, skippedFiles: 0, error: "Falta aplicar scripts/add-payment-method-mercadopago.sql" }];
    }
    throw new Error(methods.error.message);
  }

  const credentials = await service
    .from("payment_method_credentials")
    .select("payment_method_id, token_ciphertext, token_iv, token_tag, key_version")
    .eq("club_id", clubId)
    .eq("provider", "mercadopago");
  if (credentials.error) throw new Error(credentials.error.message);

  const tokenOf = new Map(
    (credentials.data ?? []).map((row) => [Number(row.payment_method_id), row]),
  );
  const results: SettlementImportCount[] = [];

  for (const method of methods.data ?? []) {
    if (!isCourtPaymentScope(String(method.scope))) continue;
    const paymentMethodId = Number(method.id);
    const stored = tokenOf.get(paymentMethodId);
    if (!stored) continue;
    try {
      const token = decryptAccessToken(
        {
          ciphertext: String(stored.token_ciphertext),
          iv: String(stored.token_iv),
          tag: String(stored.token_tag),
          keyVersion: Number(stored.key_version),
        },
        loadCredentialsKey(),
      );
      results.push(await importReadySettlements(service, { clubId, paymentMethodId, userId, token }));
    } catch (error) {
      results.push({
        paymentMethodId,
        importedFiles: 0,
        insertedRows: 0,
        skippedRows: 0,
        skippedFiles: 0,
        error: error instanceof Error ? error.message : "No se pudieron traer las liquidaciones.",
      });
    }
  }

  return results;
}
