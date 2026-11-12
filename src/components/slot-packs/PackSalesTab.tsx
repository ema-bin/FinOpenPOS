"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { slotCreditsService } from "@/services";

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function monthStart() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}

function formatDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function money(value: number) {
  return `$${value.toLocaleString("es-AR")}`;
}

function fullName(sale: { first_name: string; last_name: string }) {
  return `${sale.first_name} ${sale.last_name}`.trim();
}

export function PackSalesTab() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const rangeError = from && to && from > to ? "La fecha desde no puede ser posterior a hasta." : "";

  const { data: sales = [], isLoading, isError, error } = useQuery({
    queryKey: ["slot-pack-sales", from, to],
    queryFn: () => slotCreditsService.listSales(from, to),
    enabled: !rangeError,
  });

  const total = useMemo(
    () => sales.reduce((sum, sale) => sum + sale.amount_paid, 0),
    [sales]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 max-md:flex-col max-md:items-stretch">
        <div className="space-y-1 max-md:w-full">
          <Label htmlFor="sales-from" className="text-xs">
            Desde
          </Label>
          <Input
            id="sales-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-40 max-md:w-full"
          />
        </div>
        <div className="space-y-1 max-md:w-full">
          <Label htmlFor="sales-to" className="text-xs">
            Hasta
          </Label>
          <Input
            id="sales-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-40 max-md:w-full"
          />
        </div>
      </div>
      {rangeError ? <p className="text-sm text-destructive">{rangeError}</p> : null}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2Icon className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "No se pudieron cargar las ventas"}
        </p>
      ) : sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay ventas en esas fechas.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {sales.length} {sales.length === 1 ? "venta" : "ventas"} · Total {money(total)}
          </p>
          <div className="space-y-3 md:hidden">
            {sales.map((sale) => (
              <div key={sale.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{fullName(sale) || "Jugador"}</p>
                    <p className="text-xs text-muted-foreground">{formatDay(sale.sold_at)}</p>
                  </div>
                  <p className="text-sm font-semibold">{money(sale.amount_paid)}</p>
                </div>
                <p className="text-sm">
                  {sale.name} · {sale.credits} {sale.credits === 1 ? "turno" : "turnos"}
                </p>
                {sale.payment_method_name ? (
                  <p className="text-xs text-muted-foreground">{sale.payment_method_name}</p>
                ) : null}
                {sale.notes ? <p className="text-xs">{sale.notes}</p> : null}
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Jugador</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead>Turnos</TableHead>
                  <TableHead>Importe</TableHead>
                  <TableHead>Medio de pago</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{formatDay(sale.sold_at)}</TableCell>
                    <TableCell className="font-medium">{fullName(sale) || "Jugador"}</TableCell>
                    <TableCell>{sale.name}</TableCell>
                    <TableCell>{sale.credits}</TableCell>
                    <TableCell>{money(sale.amount_paid)}</TableCell>
                    <TableCell>{sale.payment_method_name ?? "—"}</TableCell>
                    <TableCell className="max-w-[16rem] truncate">{sale.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
