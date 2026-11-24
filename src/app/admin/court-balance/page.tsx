"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CourtDayBalance } from "@/lib/court-balance";
import { MercadoPagoCredentials } from "@/components/court-balance/MercadoPagoCredentials";
import { SettlementMatch } from "@/components/court-balance/SettlementMatch";

function todayInput() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function pesos(cents: number) {
  return (cents / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function PriceUses({ rows }: { rows: Array<{ priceCents: number | null; count: number }> }) {
  if (rows.length === 0) return <span>—</span>;
  return (
    <div className="space-y-0.5">
      {rows.map((row) => (
        <p key={row.priceCents ?? "missing"}>
          {row.count} × {row.priceCents == null ? "sin tarifa" : pesos(row.priceCents)}
        </p>
      ))}
    </div>
  );
}

async function loadBalance(date: string): Promise<CourtDayBalance> {
  const response = await fetch(`/api/court-balance?date=${date}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No se pudo cargar el balance.");
  return body;
}

export default function CourtBalancePage() {
  const [date, setDate] = useState(todayInput);
  const balance = useQuery({
    queryKey: ["court-balance", date],
    queryFn: () => loadBalance(date),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
  const data = balance.data;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Balance de canchas</h1>
          <p className="text-sm text-muted-foreground">
            Los turnos se cobran con la tarifa de ese día. Usar un crédito no suma: suma la venta del pack.
          </p>
        </div>
        <div>
          <Label htmlFor="balance-date" className="text-xs">Día</Label>
          <Input id="balance-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>

      <SettlementMatch key={date} date={date} />

      {balance.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {balance.isError && (
        <p className="text-sm text-destructive">{balance.error instanceof Error ? balance.error.message : "No se pudo cargar el balance."}</p>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Turnos jugados</CardDescription>
                <CardTitle>{pesos(data.slotRevenueCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{data.playedSlots} turno(s)</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Packs vendidos</CardDescription>
                <CardTitle>{pesos(data.packRevenueCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{data.packs.length} pack(s)</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total del día</CardDescription>
                <CardTitle>{pesos(data.totalRevenueCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {data.creditUses} uso(s) de crédito, sin sumar
                {data.missingTariff > 0 ? ` · ${data.missingTariff} pago(s) sin tarifa` : ""}
              </CardContent>
            </Card>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Por cancha</h2>
            {data.courts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay turnos jugados.</p>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {data.courts.map((court) => (
                    <div key={court.courtId ?? court.courtName} className="rounded-lg border p-3">
                      <p className="font-medium">{court.courtName}</p>
                      <p className="text-sm">{pesos(court.revenueCents)}</p>
                      <p className="text-xs text-muted-foreground">
                        {court.playedSlots} turno(s)
                        {court.unpaidSeats > 0 ? ` · ${court.unpaidSeats} sin medio de pago` : ""}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cancha</TableHead>
                        <TableHead>Turnos</TableHead>
                        <TableHead>Sin medio</TableHead>
                        <TableHead className="text-right">Recaudación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.courts.map((court) => (
                        <TableRow key={court.courtId ?? court.courtName}>
                          <TableCell>{court.courtName}</TableCell>
                          <TableCell>{court.playedSlots}</TableCell>
                          <TableCell>{court.unpaidSeats}</TableCell>
                          <TableCell className="text-right">{pesos(court.revenueCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Por medio de pago</h2>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay pagos de turnos ni de packs.</p>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {data.payments.map((payment) => (
                    <div key={payment.paymentMethodId ?? payment.paymentMethodName} className="rounded-lg border p-3">
                      <p className="font-medium">{payment.paymentMethodName}</p>
                      <p className="text-sm">{pesos(payment.revenueCents + payment.packRevenueCents)}</p>
                      <div className="text-xs text-muted-foreground">
                        <PriceUses rows={payment.priceUses} />
                        {payment.packCount > 0 ? <p>Packs {pesos(payment.packRevenueCents)}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medio</TableHead>
                        <TableHead>Usos</TableHead>
                        <TableHead className="text-right">Turnos</TableHead>
                        <TableHead className="text-right">Packs</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payments.map((payment) => (
                        <TableRow key={payment.paymentMethodId ?? payment.paymentMethodName}>
                          <TableCell>{payment.paymentMethodName}</TableCell>
                          <TableCell><PriceUses rows={payment.priceUses} /></TableCell>
                          <TableCell className="text-right">{pesos(payment.revenueCents)}</TableCell>
                          <TableCell className="text-right">{pesos(payment.packRevenueCents)}</TableCell>
                          <TableCell className="text-right">{pesos(payment.revenueCents + payment.packRevenueCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          {data.unpaid.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-destructive">Faltan medios de pago</h2>
              {data.unpaid.map((row, index) => (
                <p key={`${row.courtName}-${row.timeRange}-${index}`} className="text-sm">
                  {row.courtName} · {row.timeRange} · {row.seats} jugador(es)
                </p>
              ))}
            </section>
          )}

          {data.packs.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Packs vendidos</h2>
              {data.packs.map((pack) => (
                <p key={pack.id} className="text-sm">
                  {pack.playerName} · {pack.packName} · {pack.paymentMethodName} · {pesos(pack.amountCents)}
                </p>
              ))}
            </section>
          )}
        </>
      )}

      <MercadoPagoCredentials />
    </div>
  );
}
