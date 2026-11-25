"use client";

import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { weekdayOf } from "@/lib/class-time";
import { reconciliationTone } from "@/lib/finance/settlement-match";
import { cn } from "@/lib/utils";
import { CourtOccupancyCard } from "@/components/court-balance/CourtOccupancyCard";
import { TONE_CARD, TONE_TEXT } from "@/components/court-balance/SettlementMatch";
import type { CourtOccupancy } from "@/lib/court-occupancy";

type MonthDay = { date: string; expectedCents: number; collectedCents: number };

type MonthMethod = {
  paymentMethodId: number;
  paymentMethodName: string;
  expectedCents: number;
  collectedCents: number;
};

type MonthResponse = {
  balance: { slotRevenueCents: number; packRevenueCents: number; totalRevenueCents: number };
  expectedCents: number;
  collectedCents: number;
  methods: MonthMethod[];
  days: MonthDay[];
  occupancy?: CourtOccupancy | null;
};

function pesos(cents: number) {
  return (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function chip(cents: number) {
  return (cents / 100).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function MonthBalance({ month, onPickDay }: { month: string; onPickDay: (date: string) => void }) {
  const query = useQuery({
    queryKey: ["court-balance-month", month],
    enabled: /^\d{4}-\d{2}$/.test(month),
    queryFn: async (): Promise<MonthResponse> => {
      const response = await fetch(`/api/court-balance/month?month=${month}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el mes.");
      return body;
    },
  });
  const data = query.data;
  const difference = data ? data.collectedCents - data.expectedCents : 0;
  const tone = reconciliationTone(difference);
  const lead = data && data.days.length > 0 ? (weekdayOf(data.days[0].date) + 6) % 7 : 0;

  return (
    <section className="space-y-4">
      {query.isLoading && <p className="text-sm text-muted-foreground">Cargando el mes…</p>}
      {query.isError && (
        <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "No se pudo cargar el mes."}</p>
      )}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Turnos del mes</p>
              <p className="text-lg font-semibold">{pesos(data.balance.slotRevenueCents)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Packs del mes</p>
              <p className="text-lg font-semibold">{pesos(data.balance.packRevenueCents)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Balance del mes</p>
              <p className="text-lg font-semibold">{pesos(data.balance.totalRevenueCents)}</p>
            </div>
          </div>

          <CourtOccupancyCard occupancy={data.occupancy} title="Ocupación del mes" />

          <div className={cn("grid gap-3 rounded-lg border p-3 md:grid-cols-3", TONE_CARD[tone.tone])}>
            <div>
              <p className="text-xs text-muted-foreground">Debía entrar</p>
              <p className="text-lg font-semibold">{pesos(data.expectedCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entró en la cuenta</p>
              <p className="text-lg font-semibold">{pesos(data.collectedCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferencia</p>
              <p className="text-lg font-semibold">{pesos(difference)}</p>
              <p className="text-xs">{tone.label}</p>
            </div>
          </div>

          {data.methods.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Por medio de pago</h2>
              <p className="text-xs text-muted-foreground">Lo que debía entrar y lo que entró en cada cuenta de Mercado Pago.</p>
              <div className="space-y-2 md:hidden">
                {data.methods.map((method) => {
                  const methodDifference = method.collectedCents - method.expectedCents;
                  const methodTone = reconciliationTone(methodDifference);
                  return (
                    <div key={method.paymentMethodId} className={cn("space-y-2 rounded-lg border p-3", TONE_CARD[methodTone.tone])}>
                      <p className="font-medium">{method.paymentMethodName}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Debía entrar</p>
                          <p className="text-sm font-semibold">{pesos(method.expectedCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Entró</p>
                          <p className="text-sm font-semibold">{pesos(method.collectedCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Diferencia</p>
                          <p className={cn("text-sm font-semibold", TONE_TEXT[methodTone.tone])}>{pesos(methodDifference)}</p>
                          <p className={cn("text-xs", TONE_TEXT[methodTone.tone])}>{methodTone.label}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medio</TableHead>
                      <TableHead className="text-right">Debía entrar</TableHead>
                      <TableHead className="text-right">Entró</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.methods.map((method) => {
                      const methodDifference = method.collectedCents - method.expectedCents;
                      const methodTone = reconciliationTone(methodDifference);
                      return (
                        <TableRow key={method.paymentMethodId} className={TONE_CARD[methodTone.tone]}>
                          <TableCell>{method.paymentMethodName}</TableCell>
                          <TableCell className="text-right">{pesos(method.expectedCents)}</TableCell>
                          <TableCell className="text-right">{pesos(method.collectedCents)}</TableCell>
                          <TableCell className={cn("text-right", TONE_TEXT[methodTone.tone])}>
                            {pesos(methodDifference)}
                            <span className="ml-2 text-xs">{methodTone.label}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Cada día: arriba lo que debía entrar, abajo lo que entró.</p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <p key={label} className="text-center text-[10px] text-muted-foreground">{label}</p>
              ))}
              {Array.from({ length: lead }, (_, index) => (
                <div key={`empty-${index}`} />
              ))}
              {data.days.map((day) => {
                const quiet = day.expectedCents === 0 && day.collectedCents === 0;
                const dayTone = reconciliationTone(day.collectedCents - day.expectedCents);
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={cn(
                      "rounded-md border px-0.5 py-1 text-center leading-tight",
                      quiet ? "border-border bg-background" : TONE_CARD[dayTone.tone],
                    )}
                    onClick={() => onPickDay(day.date)}
                  >
                    <p className="text-xs font-medium">{Number(day.date.slice(8, 10))}</p>
                    {quiet ? (
                      <p className="text-[10px] text-muted-foreground">—</p>
                    ) : (
                      <>
                        <p className="text-[10px]">{chip(day.expectedCents)}</p>
                        <p className="text-[10px]">{chip(day.collectedCents)}</p>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
