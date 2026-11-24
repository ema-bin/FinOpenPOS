import { describe, expect, it } from "vitest";
import { parseSettlementReportList, isSettlementCsvBody, isSettlementCsvName } from "@/lib/finance/mercadopago-settlement";
import {
  parseSettlementCsv,
  settlementInserts,
  settlementSourceId,
} from "@/lib/finance/settlement-rows";

const csv = [
  "SOURCE_ID,TRANSACTION_TYPE,TRANSACTION_AMOUNT,DESCRIPTION",
  "1001,SETTLEMENT,13000.00,turno",
  "1001,REFUND,-13000.00,devolución",
  '"1002","SETTLEMENT","9000,50","turno, noche"',
].join("\n");

describe("filas de liquidación", () => {
  it("guarda todas las columnas y no usa SOURCE_ID como fila única", () => {
    const rows = parseSettlementCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({
      SOURCE_ID: "1002",
      TRANSACTION_TYPE: "SETTLEMENT",
      TRANSACTION_AMOUNT: "9000,50",
      DESCRIPTION: "turno, noche",
    });
    expect(settlementSourceId(rows[0])).toBe("1001");
    expect(settlementSourceId(rows[1])).toBe("1001");

    const first = settlementInserts(rows, new Set());
    expect(first.insert).toHaveLength(3);
    expect(first.insert[0].sourceId).toBe(first.insert[1].sourceId);
    expect(first.insert[0].fingerprint).not.toBe(first.insert[1].fingerprint);

    const again = settlementInserts(rows, new Set(first.insert.map((row) => row.fingerprint)));
    expect(again.insert).toHaveLength(0);
    expect(again.skipped).toBe(3);
  });

  it("lee el reporte real y separa fee_amount", () => {
    const sample = [
      "SOURCE_ID;PAYMENT_METHOD_TYPE;TRANSACTION_TYPE;TRANSACTION_AMOUNT;TRANSACTION_DATE;FEE_AMOUNT;SETTLEMENT_DATE;REAL_AMOUNT;TAXES_AMOUNT;BUSINESS_UNIT;SUB_UNIT;MONEY_RELEASE_DATE",
      "1753365476297;;SETTLEMENT;682.24;2026-11-19T00:33:26.000-03:00;0.00;2026-11-19T00:33:26.000-03:00;682.24;0.00;;;",
    ].join("\n");
    const [row] = settlementInserts(parseSettlementCsv(sample), new Set()).insert;
    expect(row.feeAmount).toBe(0);
    expect(row.transactionAmount).toBe(682.24);
    expect(row.realAmount).toBe(682.24);
    expect(row.taxesAmount).toBe(0);
    expect(row.transactionType).toBe("SETTLEMENT");
    expect(row.paymentMethodType).toBeNull();
    expect(row.moneyReleaseDate).toBeNull();
    expect(row.transactionDate).toBe("2026-11-19T03:33:26.000Z");
    expect(row.payload.FEE_AMOUNT).toBe("0.00");
  });

  it("lee un reporte separado por punto y coma", () => {
    const rows = parseSettlementCsv("SOURCE_ID;TRANSACTION_TYPE\n55;SETTLEMENT\n");
    expect(rows).toEqual([{ SOURCE_ID: "55", TRANSACTION_TYPE: "SETTLEMENT" }]);
  });
});

describe("lista de reportes", () => {
  it("se queda con los archivos que se pueden descargar", () => {
    const reports = parseSettlementReportList([
      {
        id: 123,
        file_name: "settlement-report-2016-01-20.csv",
        begin_date: "2016-01-01T00:00:00Z",
        end_date: "2016-01-20T23:59:59Z",
        created_from: "manual",
      },
      { id: 4, file_name: "../secreto.csv" },
      { status: "pending" },
    ]);
    expect(reports).toEqual([
      {
        id: "123",
        fileName: "settlement-report-2016-01-20.csv",
        beginDate: "2016-01-01T00:00:00Z",
        endDate: "2016-01-20T23:59:59Z",
        createdFrom: "manual",
      },
    ]);
  });

  it("no trata un Excel de Mercado Pago como liquidación CSV", () => {
    expect(isSettlementCsvName("settlement_v2-57922868-2026-11-22-012415.csv")).toBe(true);
    expect(isSettlementCsvName("settlement-182299452-manual-2025-10-29-113033.xlsx")).toBe(false);
    expect(isSettlementCsvBody("SOURCE_ID;TRANSACTION_AMOUNT\n1;10.00\n")).toBe(true);
    expect(isSettlementCsvBody("PK\u0003\u0004excel")).toBe(false);
  });
});
