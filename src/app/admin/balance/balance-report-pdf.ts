import { jsPDF } from "jspdf";
import type { PartnerDTO } from "@/services/partners.service";
import type { TransactionDTO } from "@/services/transactions.service";

type ReportAccount = {
  payment_method_name: string | null;
  incomes: number;
  expenses: number;
  withdrawals: number;
  adjustments: number;
  balance: number;
};

type ReportPdfInput = {
  periodLabel: string;
  sales: number;
  purchases: number;
  withdrawals: number;
  adjustmentsTotal: number;
  accounts: ReportAccount[];
  adjustments: TransactionDTO[];
  partners: PartnerDTO[];
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatReportDate(iso: string): string {
  let normalized = iso.trim();
  if (
    !normalized.endsWith("Z") &&
    !/[+-]\d{2}:?\d{2}$/.test(normalized) &&
    normalized.includes("T")
  ) {
    normalized += "Z";
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function splitInTwo(amount: number): [number, number] {
  const cents = Math.round(amount * 100);
  const first = Math.floor(cents / 2);
  return [first / 100, (cents - first) / 100];
}

function partLabels(partners: PartnerDTO[]): [string, string] {
  const named = [...partners].sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "es")
  );
  if (named.length === 2) {
    return [
      `${named[0].first_name} ${named[0].last_name}`,
      `${named[1].first_name} ${named[1].last_name}`,
    ];
  }
  return ["Parte 1", "Parte 2"];
}

function fileSlug(label: string) {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "periodo";
}

export function downloadBalanceReportPdf(input: ReportPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 14;
  const right = 196;
  const contentWidth = right - left;
  let y = 16;

  const ensure = (height: number) => {
    if (y + height > 282) {
      doc.addPage();
      y = 16;
    }
  };

  const heading = (text: string) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(text, left, y);
    y += 7;
  };

  const note = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensure(lines.length * 4 + 2);
    doc.text(lines, left, y);
    y += lines.length * 4 + 2;
  };

  const sobrante = input.sales - input.purchases - input.withdrawals + input.adjustmentsTotal;
  const [partOne, partTwo] = splitInTwo(sobrante);
  const [labelOne, labelTwo] = partLabels(input.partners);
  const methodRows = [...input.accounts]
    .filter((account) => Math.abs(account.incomes) > 0.004 || Math.abs(account.expenses) > 0.004)
    .sort((a, b) => b.incomes + b.expenses - (a.incomes + a.expenses));
  const barMax = methodRows.reduce(
    (max, account) => Math.max(max, account.incomes, account.expenses),
    0
  );
  const accountRows = [...input.accounts].sort((a, b) => b.balance - a.balance);
  const adjustmentRows = [...input.adjustments].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text("Informe de balance", left, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  doc.text(input.periodLabel, left, y);
  y += 8;

  const boxWidth = (contentWidth - 8) / 3;
  const kpis: Array<{ label: string; value: number; fill: [number, number, number]; ink: [number, number, number] }> = [
    { label: "Ventas", value: input.sales, fill: [220, 252, 231], ink: [21, 128, 61] },
    { label: "Compras", value: input.purchases, fill: [254, 226, 226], ink: [185, 28, 28] },
    { label: "Ajustes", value: input.adjustmentsTotal, fill: [219, 234, 254], ink: [29, 78, 216] },
  ];
  ensure(22);
  kpis.forEach((kpi, index) => {
    const x = left + index * (boxWidth + 4);
    doc.setFillColor(...kpi.fill);
    doc.roundedRect(x, y, boxWidth, 18, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...kpi.ink);
    doc.text(kpi.label.toUpperCase(), x + 3, y + 6);
    doc.setFontSize(12);
    doc.text(money(kpi.value), x + 3, y + 13);
  });
  y += 24;

  ensure(22);
  const surplusFill: [number, number, number] = sobrante >= 0 ? [209, 250, 229] : [254, 226, 226];
  const surplusInk: [number, number, number] = sobrante >= 0 ? [4, 120, 87] : [185, 28, 28];
  doc.setFillColor(surplusFill[0], surplusFill[1], surplusFill[2]);
  doc.roundedRect(left, y, contentWidth, 20, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text("SOBRANTE", left + 3, y + 6);
  doc.setFontSize(14);
  doc.setTextColor(surplusInk[0], surplusInk[1], surplusInk[2]);
  doc.text(money(sobrante), left + 3, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text(`Ventas - compras - retiros (${money(input.withdrawals)}) + ajustes`, right - 3, y + 14, {
    align: "right",
  });
  y += 28;

  heading("Ventas y compras por medio de pago");
  if (methodRows.length === 0) {
    note("Sin ventas ni compras en este período.");
  } else {
    methodRows.forEach((account) => {
      ensure(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(account.payment_method_name || "Sin método de pago", left, y);
      y += 5;
      const drawBar = (label: string, amount: number, color: [number, number, number]) => {
        ensure(7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...color);
        doc.text(label, left, y);
        const barX = left + 22;
        const barWidth = 118;
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(barX, y - 3, barWidth, 3.5, 1, 1, "F");
        const filled = barMax > 0 ? (Math.abs(amount) / barMax) * barWidth : 0;
        if (filled > 0) {
          doc.setFillColor(...color);
          doc.roundedRect(barX, y - 3, Math.max(filled, 1.2), 3.5, 1, 1, "F");
        }
        doc.setFont("helvetica", "bold");
        doc.text(money(amount), right, y, { align: "right" });
        y += 6;
      };
      drawBar("Ventas", account.incomes, [22, 163, 74]);
      drawBar("Compras", account.expenses, [220, 38, 38]);
      if (Math.abs(account.adjustments) > 0.004) {
        ensure(5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(29, 78, 216);
        doc.text(`Ajustes en esta cuenta: ${money(account.adjustments)}`, left, y);
        y += 5;
      }
      y += 2;
    });
  }

  heading("Detalle de ajustes");
  note("Un ajuste positivo suma al sobrante y uno negativo lo resta.");
  if (adjustmentRows.length === 0) {
    note("No hay ajustes en este período.");
  } else {
    adjustmentRows.forEach((adjustment) => {
      const description = adjustment.description || "Sin descripción";
      const meta = `${formatReportDate(adjustment.created_at)} · ${adjustment.payment_method?.name || "Sin método"}`;
      const descriptionLines = doc.splitTextToSize(description, contentWidth - 36) as string[];
      ensure(descriptionLines.length * 4 + 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(descriptionLines, left, y);
      doc.setTextColor(adjustment.amount >= 0 ? 29 : 185, adjustment.amount >= 0 ? 78 : 28, adjustment.amount >= 0 ? 216 : 28);
      doc.text(money(adjustment.amount), right, y, { align: "right" });
      y += descriptionLines.length * 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      doc.text(meta, left, y);
      y += 6;
    });
    ensure(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text("Total de ajustes", left, y);
    doc.text(money(input.adjustmentsTotal), right, y, { align: "right" });
    y += 8;
  }

  heading("Dónde quedó el dinero");
  note("En cada cuenta: ventas - compras - retiros + ajustes.");
  if (accountRows.length === 0) {
    note("Sin movimientos en este período.");
  } else {
    accountRows.forEach((account) => {
      const detail = `Ventas ${money(account.incomes)} · Compras ${money(account.expenses)} · Retiros ${money(account.withdrawals)} · Ajustes ${money(account.adjustments)}`;
      const detailLines = doc.splitTextToSize(detail, contentWidth - 36) as string[];
      ensure(detailLines.length * 4 + 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(account.payment_method_name || "Sin método de pago", left, y);
      doc.setTextColor(account.balance >= 0 ? 4 : 185, account.balance >= 0 ? 120 : 28, account.balance >= 0 ? 87 : 28);
      doc.text(money(account.balance), right, y, { align: "right" });
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      doc.text(detailLines, left, y);
      y += detailLines.length * 4 + 3;
    });
  }

  heading("Propuesta de retiro");
  if (sobrante > 0.004) {
    note("El sobrante se reparte en dos partes iguales. Los retiros ya hechos en el período quedan descontados.");
    ensure(20);
    const half = (contentWidth - 4) / 2;
    const parts = [
      { label: labelOne, amount: partOne },
      { label: labelTwo, amount: partTwo },
    ];
    parts.forEach((part, index) => {
      const x = left + index * (half + 4);
      doc.setFillColor(index === 0 ? 5 : 110, index === 0 ? 150 : 231, index === 0 ? 105 : 183);
      doc.rect(x, y, half, 3, "F");
      doc.setFillColor(236, 253, 245);
      doc.rect(x, y + 3, half, 15, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(6, 78, 59);
      doc.text(part.label, x + 3, y + 9);
      doc.setFontSize(12);
      doc.text(money(part.amount), x + 3, y + 15);
    });
  } else {
    note("No queda sobrante para retirar en este período.");
  }

  doc.save(`informe-balance-${fileSlug(input.periodLabel)}.pdf`);
}
