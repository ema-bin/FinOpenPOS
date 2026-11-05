"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { PartnerDTO } from "@/services/partners.service";
import type { TransactionDTO } from "@/services/transactions.service";

export type BalanceReportAccount = {
  payment_method_id: number | null;
  payment_method_name: string | null;
  incomes: number;
  expenses: number;
  withdrawals: number;
  adjustments: number;
  balance: number;
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

function AmountBar({
  amount,
  max,
  className,
}: {
  amount: number;
  max: number;
  className: string;
}) {
  const width = max > 0 ? Math.min(100, (Math.abs(amount) / max) * 100) : 0;
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div className={`h-3 rounded-full ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function BalanceReport({
  open,
  onClose,
  periodLabel,
  sales,
  purchases,
  withdrawals,
  adjustmentsTotal,
  accounts,
  adjustments,
  loadingAdjustments,
  partners,
}: {
  open: boolean;
  onClose: () => void;
  periodLabel: string;
  sales: number;
  purchases: number;
  withdrawals: number;
  adjustmentsTotal: number;
  accounts: BalanceReportAccount[];
  adjustments: TransactionDTO[];
  loadingAdjustments: boolean;
  partners: PartnerDTO[];
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const sobrante = sales - purchases - withdrawals + adjustmentsTotal;
  const [partOne, partTwo] = splitInTwo(sobrante);
  const [labelOne, labelTwo] = partLabels(partners);
  const canPropose = sobrante > 0.004;
  const methodRows = [...accounts]
    .filter((account) => Math.abs(account.incomes) > 0.004 || Math.abs(account.expenses) > 0.004)
    .sort((a, b) => b.incomes + b.expenses - (a.incomes + a.expenses));
  const barMax = methodRows.reduce(
    (max, account) => Math.max(max, account.incomes, account.expenses),
    0
  );
  const accountRows = [...accounts].sort((a, b) => b.balance - a.balance);
  const adjustmentRows = [...adjustments].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
  );

  return (
    <div className="balance-report-sheet fixed inset-0 z-50 overflow-y-auto bg-background">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .balance-report-sheet, .balance-report-sheet * { visibility: visible; }
          .balance-report-sheet {
            position: absolute;
            inset: auto;
            left: 0;
            top: 0;
            width: 100%;
            overflow: visible;
            background: white;
          }
          .balance-report-actions { display: none !important; }
        }
      `}</style>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 print:max-w-none print:px-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Informe de balance</h1>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </div>
          <div className="balance-report-actions flex gap-2">
            <Button type="button" variant="outline" onClick={() => window.print()}>
              Imprimir
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-green-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-green-800">Ventas</div>
            <div className="mt-1 text-3xl font-bold text-green-700">{money(sales)}</div>
          </div>
          <div className="rounded-xl border bg-red-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-red-800">Compras</div>
            <div className="mt-1 text-3xl font-bold text-red-700">{money(purchases)}</div>
          </div>
          <div className="rounded-xl border bg-blue-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-blue-800">Ajustes</div>
            <div className="mt-1 text-3xl font-bold text-blue-700">{money(adjustmentsTotal)}</div>
          </div>
        </div>

        <div className={`rounded-xl border p-4 ${sobrante >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sobrante
          </div>
          <div className={`mt-1 text-3xl font-bold ${sobrante >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {money(sobrante)}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ventas − compras − retiros ({money(withdrawals)}) + ajustes.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ventas y compras por medio de pago</h2>
          {methodRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas ni compras en este período.</p>
          ) : (
            <div className="space-y-4">
              {methodRows.map((account, index) => (
                <div
                  key={account.payment_method_id ?? `method-${index}`}
                  className="space-y-2 rounded-xl border p-3"
                >
                  <div className="font-medium">
                    {account.payment_method_name || "Sin método de pago"}
                  </div>
                  <div className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-sm">
                    <span className="text-green-700">Ventas</span>
                    <AmountBar amount={account.incomes} max={barMax} className="bg-green-600" />
                    <span className="text-right font-medium tabular-nums text-green-700">
                      {money(account.incomes)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-sm">
                    <span className="text-red-700">Compras</span>
                    <AmountBar amount={account.expenses} max={barMax} className="bg-red-600" />
                    <span className="text-right font-medium tabular-nums text-red-700">
                      {money(account.expenses)}
                    </span>
                  </div>
                  {Math.abs(account.adjustments) > 0.004 && (
                    <p className="text-sm text-blue-700">
                      Ajustes en esta cuenta: {money(account.adjustments)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Detalle de ajustes</h2>
          <p className="text-sm text-muted-foreground">
            Un ajuste positivo suma al sobrante y uno negativo lo resta.
          </p>
          {loadingAdjustments ? (
            <p className="text-sm text-muted-foreground">Cargando ajustes...</p>
          ) : adjustmentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ajustes en este período.</p>
          ) : (
            <div className="space-y-2">
              {adjustmentRows.map((adjustment) => (
                <div
                  key={adjustment.id}
                  className="flex items-start justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{adjustment.description || "Sin descripción"}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatReportDate(adjustment.created_at)}
                      {" · "}
                      {adjustment.payment_method?.name || "Sin método"}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 font-semibold tabular-nums ${
                      adjustment.amount >= 0 ? "text-blue-700" : "text-red-700"
                    }`}
                  >
                    {money(adjustment.amount)}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl border bg-blue-50 px-3 py-2">
                <span className="font-medium text-blue-900">Total de ajustes</span>
                <span className="font-bold tabular-nums text-blue-800">{money(adjustmentsTotal)}</span>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dónde quedó el dinero</h2>
          <p className="text-sm text-muted-foreground">
            En cada cuenta: ventas − compras − retiros + ajustes.
          </p>
          {accountRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos en este período.</p>
          ) : (
            <div className="space-y-2">
              {accountRows.map((account, index) => (
                <div
                  key={account.payment_method_id ?? `account-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {account.payment_method_name || "Sin método de pago"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Ventas {money(account.incomes)} · Compras {money(account.expenses)} · Retiros{" "}
                      {money(account.withdrawals)} · Ajustes {money(account.adjustments)}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-lg font-bold tabular-nums ${
                      account.balance >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {money(account.balance)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Propuesta de retiro</h2>
          {canPropose ? (
            <>
              <p className="text-sm text-muted-foreground">
                El sobrante se reparte en dos partes iguales. Los retiros ya hechos en el período
                quedan descontados.
              </p>
              <div className="flex h-4 overflow-hidden rounded-full">
                <div className="w-1/2 bg-emerald-600" />
                <div className="w-1/2 bg-emerald-300" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm font-medium text-emerald-900">{labelOne}</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-800">
                    {money(partOne)}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="text-sm font-medium text-emerald-900">{labelTwo}</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-800">
                    {money(partTwo)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No queda sobrante para retirar en este período.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
