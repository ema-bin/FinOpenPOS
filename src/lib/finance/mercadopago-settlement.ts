const LIST_URL = "https://api.mercadopago.com/v1/account/settlement_report/list";

export type MpSettlementReport = {
  id: string | null;
  fileName: string;
  beginDate: string | null;
  endDate: string | null;
  createdFrom: string | null;
};

const FILE_NAME = /^[A-Za-z0-9._-]+$/;

export class MercadoPagoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

function textOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseSettlementReportList(body: unknown): MpSettlementReport[] {
  if (!Array.isArray(body)) {
    throw new MercadoPagoError("Mercado Pago no devolvió la lista de liquidaciones.");
  }
  const reports: MpSettlementReport[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const fileName = textOf(record.file_name);
    if (!fileName || !FILE_NAME.test(fileName)) continue;
    reports.push({
      id: textOf(record.id),
      fileName,
      beginDate: textOf(record.begin_date),
      endDate: textOf(record.end_date),
      createdFrom: textOf(record.created_from),
    });
  }
  return reports;
}

async function mpText(response: Response, token: string): Promise<string> {
  const body = await response.text();
  if (response.ok) return body;
  const safe = body.replaceAll(token, "").slice(0, 300);
  if (response.status === 401 || response.status === 403) {
    throw new MercadoPagoError("Mercado Pago rechazó el access token.");
  }
  throw new MercadoPagoError(`Mercado Pago respondió ${response.status}. ${safe}`.trim());
}

export async function listSettlementReports(token: string, fetchImpl: typeof fetch = fetch): Promise<MpSettlementReport[]> {
  const response = await fetchImpl(LIST_URL, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body = await mpText(response, token);
  return parseSettlementReportList(JSON.parse(body));
}

export async function downloadSettlementReport(
  token: string,
  fileName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!FILE_NAME.test(fileName)) {
    throw new MercadoPagoError("El nombre del reporte no es válido.");
  }
  const response = await fetchImpl(
    `https://api.mercadopago.com/v1/account/settlement_report/${encodeURIComponent(fileName)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return mpText(response, token);
}
