import { createHash } from "node:crypto";

export type SettlementInsert = {
  sourceId: string | null;
  fingerprint: string;
  payload: Record<string, string>;
  paymentMethodType: string | null;
  transactionType: string | null;
  transactionAmount: number | null;
  transactionDate: string | null;
  feeAmount: number | null;
  settlementDate: string | null;
  realAmount: number | null;
  taxesAmount: number | null;
  businessUnit: string | null;
  subUnit: string | null;
  moneyReleaseDate: string | null;
};

function splitRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      records.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") records.push(current);
  return records;
}

function parseLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === separator && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function separatorOf(header: string): string {
  const commas = header.split(",").length;
  const semicolons = header.split(";").length;
  return semicolons > commas ? ";" : ",";
}

/** Cada fila conserva todas las columnas, con el texto tal como vino. */
export function parseSettlementCsv(text: string): Record<string, string>[] {
  const records = splitRecords(text.replace(/^\uFEFF/, ""));
  const headerLine = records.find((record) => record.trim() !== "");
  if (!headerLine) return [];
  const separator = separatorOf(headerLine);
  const headers = parseLine(headerLine, separator).map((header) => header.trim());
  const rows: Record<string, string>[] = [];
  let started = false;
  for (const record of records) {
    if (!started) {
      if (record === headerLine) started = true;
      continue;
    }
    if (record.trim() === "") continue;
    const cells = parseLine(record, separator);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export function settlementSourceId(row: Record<string, string>): string | null {
  return textCell(row, "SOURCE_ID");
}

function textCell(row: Record<string, string>, column: string): string | null {
  const key = Object.keys(row).find((name) => name.trim().toUpperCase() === column);
  const value = key ? row[key].trim() : "";
  return value || null;
}

function moneyCell(row: Record<string, string>, column: string): number | null {
  const value = textCell(row, column);
  if (!value) return null;
  let normalized = value.replace(/\s/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function dateCell(row: Record<string, string>, column: string): string | null {
  const value = textCell(row, column);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function settlementColumns(row: Record<string, string>) {
  return {
    paymentMethodType: textCell(row, "PAYMENT_METHOD_TYPE"),
    transactionType: textCell(row, "TRANSACTION_TYPE"),
    transactionAmount: moneyCell(row, "TRANSACTION_AMOUNT"),
    transactionDate: dateCell(row, "TRANSACTION_DATE"),
    feeAmount: moneyCell(row, "FEE_AMOUNT"),
    settlementDate: dateCell(row, "SETTLEMENT_DATE"),
    realAmount: moneyCell(row, "REAL_AMOUNT"),
    taxesAmount: moneyCell(row, "TAXES_AMOUNT"),
    businessUnit: textCell(row, "BUSINESS_UNIT"),
    subUnit: textCell(row, "SUB_UNIT"),
    moneyReleaseDate: dateCell(row, "MONEY_RELEASE_DATE"),
  };
}

export function settlementRowFingerprint(row: Record<string, string>): string {
  const stable = Object.keys(row)
    .sort()
    .map((key) => `${key}=${row[key]}`)
    .join("\n");
  return createHash("sha256").update(stable).digest("hex");
}

/** SOURCE_ID no alcanza para identificar la fila: un pago y su devolución pueden compartirlo. */
export function settlementInserts(
  rows: Record<string, string>[],
  existing: ReadonlySet<string>,
): { insert: SettlementInsert[]; skipped: number } {
  const seen = new Set(existing);
  const insert: SettlementInsert[] = [];
  let skipped = 0;
  for (const row of rows) {
    const fingerprint = settlementRowFingerprint(row);
    if (seen.has(fingerprint)) {
      skipped += 1;
      continue;
    }
    seen.add(fingerprint);
    insert.push({ sourceId: settlementSourceId(row), fingerprint, payload: row, ...settlementColumns(row) });
  }
  return { insert, skipped };
}
