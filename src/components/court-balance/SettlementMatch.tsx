"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/components/permissions-provider";
import { reconciliationTone, type ReconciliationTone } from "@/lib/finance/settlement-match";
import { cn } from "@/lib/utils";

const GREEN = "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100";
const RED = "border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100";

export const TONE_CARD: Record<ReconciliationTone, string> = {
  even: "border-border bg-white dark:bg-background",
  "favor-small": GREEN,
  "favor-medium": GREEN,
  "favor-large": GREEN,
  "against-small": RED,
  "against-medium": RED,
  "against-large": RED,
};

export const TONE_TEXT: Record<ReconciliationTone, string> = {
  even: "text-foreground",
  "favor-small": "text-emerald-800 dark:text-emerald-200",
  "favor-medium": "text-emerald-800 dark:text-emerald-200",
  "favor-large": "text-emerald-800 dark:text-emerald-200",
  "against-small": "text-red-800 dark:text-red-200",
  "against-medium": "text-red-800 dark:text-red-200",
  "against-large": "text-red-800 dark:text-red-200",
};

type ChargeOption = {
  key: string;
  kind: "court_seat" | "pack";
  courtSlotId: number | null;
  seatIndex: number | null;
  packId: number | null;
  label: string;
  amountCents: number;
};

type MatchRow = {
  id: number;
  sourceId: string | null;
  at: string | null;
  amountCents: number;
  kind: "collection" | "yield" | "withdrawal" | "refund";
  effectiveKind: "collection" | "yield" | "withdrawal" | "refund" | "ignored";
  ambiguous: boolean;
  suggestion: ChargeOption | null;
  matched: ChargeOption | null;
  candidates: ChargeOption[];
  mark: { kind: string; courtSlotId: number | null; seatIndex: number | null; packId: number | null } | null;
};

type MatchMethod = {
  paymentMethodId: number;
  paymentMethodName: string;
  expectedCents: number;
  collectedCents: number;
  yieldCents: number;
  withdrawalCents: number;
  refundCents: number;
  missingTariff: number;
  rows: MatchRow[];
};

type MatchResponse = { timezone: string; methods: MatchMethod[] };

function pesos(cents: number) {
  return (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function whenOf(iso: string | null, timeZone: string) {
  if (!iso) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

const KIND_LABEL: Record<MatchRow["effectiveKind"], string> = {
  collection: "Cobro",
  yield: "Rendimiento",
  withdrawal: "Retiro",
  refund: "Devolución",
  ignored: "Ignorado",
};

function optionValue(row: MatchRow): string {
  if (!row.mark) return "";
  if (row.mark.kind === "court_seat") return `seat:${row.mark.courtSlotId}:${row.mark.seatIndex}`;
  if (row.mark.kind === "pack") return `pack:${row.mark.packId}`;
  return row.mark.kind;
}

function markFromValue(value: string): { kind: string; courtSlotId?: number; seatIndex?: number; packId?: number } | null {
  if (!value) return null;
  if (value.startsWith("seat:")) {
    const [, slotId, seatIndex] = value.split(":");
    return { kind: "court_seat", courtSlotId: Number(slotId), seatIndex: Number(seatIndex) };
  }
  if (value.startsWith("pack:")) return { kind: "pack", packId: Number(value.slice(5)) };
  return { kind: value };
}

function RowSelect({
  row,
  disabled,
  onChange,
}: {
  row: MatchRow;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const marked = row.matched && !row.candidates.some((candidate) => candidate.key === row.matched?.key)
    ? [row.matched]
    : [];
  const options = [
    ...marked,
    ...row.candidates,
  ].map((candidate) => ({ value: candidate.key, label: candidate.label }));
  options.push(
    { value: "yield", label: "Es rendimiento" },
    { value: "withdrawal", label: "Es un retiro" },
    { value: "ignored", label: "Ignorar" },
  );
  return (
    <select
      aria-label={`Cruce de ${row.sourceId ?? row.id}`}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
      value={optionValue(row)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Sin marcar</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function statusText(row: MatchRow) {
  if (row.matched) return row.matched.label;
  if (row.suggestion) return `Coincide con ${row.suggestion.label}`;
  if (row.ambiguous) return "Hay más de un turno con ese monto";
  if (row.effectiveKind === "collection") return "No hay un turno ni un pack de ese monto";
  return KIND_LABEL[row.effectiveKind];
}

/** En la lista de cobros solo entran montos positivos. Los negativos van a Gastos. */
function collectionRows(rows: MatchRow[]) {
  return rows
    .filter((row) => (row.kind === "collection" || row.effectiveKind === "collection") && row.amountCents > 0)
    .slice()
    .sort((a, b) => {
      if (a.at == null && b.at == null) return a.id - b.id;
      if (a.at == null) return 1;
      if (b.at == null) return -1;
      return a.at.localeCompare(b.at) || a.id - b.id;
    });
}

function expenseRows(methods: MatchMethod[]) {
  return methods
    .flatMap((method) =>
      method.rows
        .filter((row) => row.amountCents < 0)
        .map((row) => ({ ...row, paymentMethodName: method.paymentMethodName })),
    )
    .sort((a, b) => {
      if (a.at == null && b.at == null) return a.id - b.id;
      if (a.at == null) return 1;
      if (b.at == null) return -1;
      return a.at.localeCompare(b.at) || a.id - b.id;
    });
}

export function SettlementMatch({ date }: { date: string }) {
  const { can, loading } = usePermissions();
  const canWrite = !loading && can("finance.manage");
  const queryClient = useQueryClient();
  const match = useQuery({
    queryKey: ["settlement-match", date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: async (): Promise<MatchResponse> => {
      const response = await fetch(`/api/court-balance/settlement-match?date=${date}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cruzar Mercado Pago.");
      return body;
    },
  });
  const save = useMutation({
    mutationFn: async (input: { rowId: number; value: string }) => {
      const response = await fetch("/api/court-balance/settlement-match", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, rowId: input.rowId, mark: markFromValue(input.value) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la marca.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settlement-match", date] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar la marca."),
  });

  const data = match.data;
  const [openId, setOpenId] = useState<number | null>(null);
  const expenses = data ? expenseRows(data.methods) : [];
  const expenseCents = expenses.reduce((total, expense) => total + expense.amountCents, 0);

  return (
    <>
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Conciliación</h2>
        <p className="text-sm text-muted-foreground">
          Lo registrado en turnos y packs, contra lo que entró en Mercado Pago.
        </p>
      </div>
      {match.isLoading && <p className="text-sm text-muted-foreground">Cargando la conciliación…</p>}
      {match.isError && (
        <p className="text-sm text-destructive">{match.error instanceof Error ? match.error.message : "No se pudo cruzar Mercado Pago."}</p>
      )}
      {data && data.methods.length === 0 && (
        <p className="text-sm text-muted-foreground">Ningún medio de cancha está marcado como Mercado Pago.</p>
      )}
      {data?.methods.map((method) => {
        const difference = method.collectedCents - method.expectedCents;
        const tone = reconciliationTone(difference);
        const open = openId === method.paymentMethodId;
        const collections = collectionRows(method.rows);
        return (
          <div key={method.paymentMethodId} className={cn("space-y-3 rounded-lg border p-3", TONE_CARD[tone.tone])}>
            <p className="font-medium">{method.paymentMethodName}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Registrado</p>
                <p className="text-lg font-semibold">{pesos(method.expectedCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entró en la cuenta</p>
                <p className="text-lg font-semibold">{pesos(method.collectedCents)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Diferencia</p>
                <p className={cn("text-lg font-semibold", TONE_TEXT[tone.tone])}>{pesos(difference)}</p>
                <p className={cn("text-xs", TONE_TEXT[tone.tone])}>{tone.label}</p>
              </div>
            </div>
            {method.missingTariff > 0 && (
              <p className="text-xs text-muted-foreground">
                {method.missingTariff} pago(s) sin tarifa no entran en lo registrado.
              </p>
            )}
            {collections.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpenId(open ? null : method.paymentMethodId)}
              >
                {open ? "Ocultar movimientos" : `Ver movimientos (${collections.length})`}
              </Button>
            )}
            {open && (
              <div className="space-y-2">
                <div className="space-y-2 md:hidden">
                  {collections.map((row) => (
                    <div key={row.id} className="rounded-md border p-3">
                      <p className="font-medium">{pesos(row.amountCents)}</p>
                      <p className="text-xs text-muted-foreground">
                        {whenOf(row.at, data.timezone)} · {KIND_LABEL[row.effectiveKind]} · {row.sourceId ?? "Sin operación"}
                      </p>
                      <p className="py-1 text-sm">{statusText(row)}</p>
                      {canWrite ? (
                        <RowSelect row={row} disabled={save.isPending} onChange={(value) => save.mutate({ rowId: row.id, value })} />
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Operación</TableHead>
                        <TableHead>Clase</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Cruce</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collections.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap">{whenOf(row.at, data.timezone)}</TableCell>
                          <TableCell>{row.sourceId ?? "—"}</TableCell>
                          <TableCell>{KIND_LABEL[row.effectiveKind]}</TableCell>
                          <TableCell className="text-right">{pesos(row.amountCents)}</TableCell>
                          <TableCell className="min-w-56">
                            <p className="pb-1 text-xs text-muted-foreground">{statusText(row)}</p>
                            {canWrite ? (
                              <RowSelect row={row} disabled={save.isPending} onChange={(value) => save.mutate({ rowId: row.id, value })} />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
    {data && (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Gastos</h2>
        <p className="text-xs text-muted-foreground">
          Movimientos del día en los que salió plata. No entran en lo cobrado de canchas.
        </p>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">{pesos(expenseCents)}</p>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos en el día.</p>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {expenses.map((expense) => (
                <div key={expense.id} className="space-y-1 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm whitespace-nowrap">{whenOf(expense.at, data.timezone)}</p>
                    <p className="text-sm font-semibold">{pesos(expense.amountCents)}</p>
                  </div>
                  <p className="text-sm">{expense.paymentMethodName}</p>
                  <p className="text-xs text-muted-foreground">{expense.sourceId ?? "Sin operación"}</p>
                </div>
              ))}
            </div>
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Operación</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="whitespace-nowrap">{whenOf(expense.at, data.timezone)}</TableCell>
                      <TableCell>{expense.sourceId ?? "Sin operación"}</TableCell>
                      <TableCell>{expense.paymentMethodName}</TableCell>
                      <TableCell className="text-right">{pesos(expense.amountCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    )}
    </>
  );
}
