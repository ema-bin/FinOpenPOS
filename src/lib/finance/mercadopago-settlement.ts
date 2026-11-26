const LIST_URL = "https://api.mercadopago.com/v1/account/settlement_report/list";
const CREATE_URL = "https://api.mercadopago.com/v1/account/settlement_report";

export type MpSettlementReport = {
  id: string | null;
  fileName: string;
  beginDate: string | null;
  endDate: string | null;
  createdFrom: string | null;
};

const FILE_NAME = /^[A-Za-z0-9._-]+$/;

/** El reporte de liquidación que guardamos es el CSV. El Excel manual no trae filas de texto. */
export function isSettlementCsvName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".csv");
}

export function isSettlementCsvBody(text: string): boolean {
  if (!text || text.includes("\u0000") || text.startsWith("PK")) return false;
  return true;
}

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

function fetchFailure(error: unknown, token: string): MercadoPagoError {
  const err = error instanceof Error ? error : new Error("fetch failed");
  const cause = err.cause instanceof Error ? err.cause.message : "";
  const detail = [err.message, cause].filter(Boolean).join(": ").replaceAll(token, "").slice(0, 300);
  return new MercadoPagoError(`No se pudo conectar con Mercado Pago. ${detail}`.trim());
}

/** El archivo suele venir por una redirección. El token solo va a Mercado Pago; el destino lo rechaza. */
async function mpFetch(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const host = new URL(current).hostname;
    const sendToken = host === "api.mercadopago.com" || host.endsWith(".mercadopago.com");
    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        headers: sendToken ? { ...headers, Authorization: `Bearer ${token}` } : headers,
      });
    } catch (error) {
      throw fetchFailure(error, token);
    }
    if (response.status < 300 || response.status >= 400) return response;
    await response.body?.cancel().catch(() => undefined);
    const location = response.headers.get("location");
    if (!location) throw new MercadoPagoError("Mercado Pago no indicó dónde bajar el archivo.");
    current = new URL(location, current).toString();
  }
  throw new MercadoPagoError("Mercado Pago redirigió demasiadas veces.");
}

async function mpText(response: Response, token: string): Promise<string> {
  let body = "";
  try {
    body = await response.text();
  } catch (error) {
    throw fetchFailure(error, token);
  }
  if (response.ok) return body;
  const safe = body.replaceAll(token, "").slice(0, 300);
  if (response.status === 401 || response.status === 403) {
    throw new MercadoPagoError("Mercado Pago rechazó el access token.");
  }
  throw new MercadoPagoError(`Mercado Pago respondió ${response.status}. ${safe}`.trim());
}

export async function listSettlementReports(token: string, fetchImpl: typeof fetch = fetch): Promise<MpSettlementReport[]> {
  const response = await mpFetch(LIST_URL, token, fetchImpl, { Accept: "application/json" });
  const body = await mpText(response, token);
  return parseSettlementReportList(JSON.parse(body));
}

export type MpSettlementRequest = {
  id: string | null;
  status: string | null;
  beginDate: string | null;
  endDate: string | null;
  fileName: string | null;
};

/** Pide un reporte manual. Mercado Pago lo arma después y recién entonces tiene file_name. */
export async function requestSettlementReport(
  token: string,
  beginDate: string,
  endDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MpSettlementRequest> {
  let response: Response;
  try {
    response = await fetchImpl(CREATE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
    });
  } catch (error) {
    throw fetchFailure(error, token);
  }
  const body = await mpText(response, token);
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MercadoPagoError("Mercado Pago no devolvió el pedido de reporte.");
  }
  const record = parsed as Record<string, unknown>;
  return {
    id: textOf(record.id),
    status: textOf(record.status),
    beginDate: textOf(record.begin_date),
    endDate: textOf(record.end_date),
    fileName: textOf(record.file_name),
  };
}

export async function downloadSettlementReport(
  token: string,
  fileName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!FILE_NAME.test(fileName)) {
    throw new MercadoPagoError("El nombre del reporte no es válido.");
  }
  const url = `https://api.mercadopago.com/v1/account/settlement_report/${encodeURIComponent(fileName)}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await mpFetch(url, token, fetchImpl, {});
      return await mpText(response, token);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
