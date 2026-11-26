import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptAccessToken,
  loadCredentialsKey,
} from "@/lib/finance/credentials";
import { isCourtPaymentScope } from "@/lib/finance/payment-credentials";
import { requestSettlementReport } from "@/lib/finance/mercadopago-settlement";
import { settlementRequestWindow, type SettlementRequestWindow } from "@/lib/finance/settlement-window";

const FLAG_SCRIPT = "scripts/add-payment-method-mercadopago.sql";

export type SettlementRequestResult = SettlementRequestWindow & {
  paymentMethodId: number;
  id: string | null;
  status: string | null;
  fileName: string | null;
  error?: string;
};

function failed(paymentMethodId: number, timeZone: string, now: Date, error: string): SettlementRequestResult {
  return { paymentMethodId, ...settlementRequestWindow(now, timeZone), id: null, status: null, fileName: null, error };
}

/** Pide a Mercado Pago el reporte de ayer y de hoy para cada medio de cancha con token. */
export async function requestClubSettlementReports(
  service: SupabaseClient,
  clubId: number,
  timeZone: string,
  now = new Date(),
): Promise<SettlementRequestResult[]> {
  const methods = await service
    .from("payment_methods")
    .select("id, scope, is_mercadopago")
    .eq("club_id", clubId)
    .eq("is_mercadopago", true);
  if (methods.error) {
    if (methods.error.code === "42703" || /is_mercadopago/i.test(methods.error.message ?? "")) {
      return [failed(0, timeZone, now, `Falta aplicar ${FLAG_SCRIPT}`)];
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
  const window = settlementRequestWindow(now, timeZone);
  const results: SettlementRequestResult[] = [];

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
      const report = await requestSettlementReport(token, window.beginDate, window.endDate);
      results.push({
        paymentMethodId,
        ...window,
        id: report.id,
        status: report.status,
        beginDate: report.beginDate ?? window.beginDate,
        endDate: report.endDate ?? window.endDate,
        fileName: report.fileName,
      });
    } catch (error) {
      results.push(failed(
        paymentMethodId,
        timeZone,
        now,
        error instanceof Error ? error.message : "No se pudo pedir el reporte.",
      ));
    }
  }

  return results;
}
