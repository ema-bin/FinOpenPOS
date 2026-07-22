"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2Icon, LockIcon, CalendarRangeIcon } from "lucide-react";
import { toast } from "sonner";
import { dailySalesClosuresService } from "@/services/daily-sales-closures.service";
import { getCurrentBusinessDate, getPreviousBusinessDate, formatBusinessDayLabel, enumerateBusinessDates } from "@/lib/business-day";
import type { DailySalesClosureDTO, DailySalesClosurePreviewDTO } from "@/models/dto/daily-sales-closure";
import type {
  DailySalesClosuresBackfillResult,
  DailySalesClosuresBackfillProgress,
} from "@/services/daily-sales-closures.service";
import { Checkbox } from "@/components/ui/checkbox";

function mapPreviewToDisplay(preview: NonNullable<DailySalesClosurePreviewDTO["preview"]>) {
  return {
    totalSales: preview.totalSales,
    ordersClosedCount: preview.ordersClosedCount,
    transactionsCount: preview.transactionsCount,
    totalDiscount: preview.totalDiscount,
    openOrdersCount: preview.openOrdersCount,
    openOrdersTotal: preview.openOrdersTotal,
    zeroAmountOrdersCount: preview.zeroAmountOrdersCount,
    discountedOrdersCount: preview.discountedOrdersCount,
    paymentMethods: preview.byPaymentMethod.map((row, index) => ({
      id: index,
      payment_method_id: row.paymentMethodId,
      payment_method_name: row.paymentMethodName,
      total_amount: row.totalAmount,
      transaction_count: row.transactionCount,
    })),
    products: preview.byProduct.map((row, index) => ({
      id: index,
      product_id: row.productId,
      product_name: row.productName,
      category_id: row.categoryId,
      category_name: row.categoryName,
      quantity_sold: row.quantitySold,
      total_amount: row.totalAmount,
    })),
    categories: preview.byCategory.map((row, index) => ({
      id: index,
      category_id: row.categoryId,
      category_name: row.categoryName,
      quantity_sold: row.quantitySold,
      total_amount: row.totalAmount,
    })),
  };
}

function SummaryCards({
  totalSales,
  ordersClosedCount,
  transactionsCount,
  totalDiscount,
  openOrdersCount,
  openOrdersTotal,
  zeroAmountOrdersCount,
  discountedOrdersCount,
}: {
  totalSales: number;
  ordersClosedCount: number;
  transactionsCount: number;
  totalDiscount: number;
  openOrdersCount: number;
  openOrdersTotal: number;
  zeroAmountOrdersCount: number;
  discountedOrdersCount: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Total ventas</div>
        <div className="text-2xl font-bold text-green-600">${totalSales.toFixed(2)}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Órdenes cerradas</div>
        <div className="text-2xl font-bold">{ordersClosedCount}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Cobros registrados</div>
        <div className="text-2xl font-bold">{transactionsCount}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Descuentos</div>
        <div className="text-2xl font-bold">${totalDiscount.toFixed(2)}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Órdenes con descuento</div>
        <div className="text-2xl font-bold">{discountedOrdersCount}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Cuentas abiertas al cierre</div>
        <div className="text-2xl font-bold">
          {openOrdersCount}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            (${openOrdersTotal.toFixed(2)})
          </span>
        </div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Ventas sin cobro</div>
        <div className="text-2xl font-bold">{zeroAmountOrdersCount}</div>
      </div>
    </div>
  );
}

function ClosureDetailTables({
  paymentMethods = [],
  products = [],
  categories = [],
}: {
  paymentMethods?: DailySalesClosureDTO["payment_methods"];
  products?: DailySalesClosureDTO["products"];
  categories?: DailySalesClosureDTO["categories"];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2">Ventas por medio de pago</h3>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Cobros</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentMethods.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.payment_method_name}</TableCell>
                  <TableCell className="text-right">{row.transaction_count}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${row.total_amount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <h3 className="font-semibold mb-2">Ventas por producto</h3>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin productos vendidos en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.product_name}</TableCell>
                  <TableCell>{row.category_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.quantity_sold}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${row.total_amount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <h3 className="font-semibold mb-2">Ventas por categoría</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin categorías en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.category_name}</TableCell>
                  <TableCell className="text-right">{row.quantity_sold}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${row.total_amount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default function DailySalesClosurePage() {
  const queryClient = useQueryClient();
  const defaultDate = useMemo(() => getCurrentBusinessDate(), []);
  const defaultRangeTo = useMemo(() => getPreviousBusinessDate(), []);
  const defaultRangeFrom = useMemo(() => {
    const end = new Date(`${defaultRangeTo}T12:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() - 29);
    return end.toISOString().slice(0, 10);
  }, [defaultRangeTo]);
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState(defaultRangeFrom);
  const [rangeTo, setRangeTo] = useState(defaultRangeTo);
  const [rangeNotes, setRangeNotes] = useState("");
  const [rangeSkipExisting, setRangeSkipExisting] = useState(true);
  const [rangeConfirmOpen, setRangeConfirmOpen] = useState(false);
  const [rangeResult, setRangeResult] = useState<DailySalesClosuresBackfillResult | null>(null);
  const [rangeRunning, setRangeRunning] = useState(false);
  const [rangeProgress, setRangeProgress] = useState<DailySalesClosuresBackfillProgress | null>(
    null
  );
  const [rangeFinished, setRangeFinished] = useState(false);

  const { data: previewData, isLoading: loadingPreview } = useQuery({
    queryKey: ["daily-sales-closure-preview", selectedDate],
    queryFn: () => dailySalesClosuresService.getPreview(selectedDate),
    staleTime: 1000 * 15,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["daily-sales-closures"],
    queryFn: () => dailySalesClosuresService.list(30),
    staleTime: 1000 * 30,
  });

  const { data: historyDetail, isLoading: loadingHistoryDetail } = useQuery({
    queryKey: ["daily-sales-closure-detail", historyDate],
    queryFn: () => dailySalesClosuresService.getByDate(historyDate!),
    enabled: Boolean(historyDate),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      dailySalesClosuresService.create({
        businessDate: selectedDate,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        result.replaced ? "Cierre corregido y actualizado" : "Cierre de caja registrado"
      );
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["daily-sales-closure-preview"] });
      queryClient.invalidateQueries({ queryKey: ["daily-sales-closures"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleRangeBackfill = async () => {
    setRangeRunning(true);
    setRangeFinished(false);
    setRangeProgress(null);
    setRangeResult(null);

    try {
      const result = await dailySalesClosuresService.backfillRangeWithProgress(
        {
          fromDate: rangeFrom,
          toDate: rangeTo,
          notes: rangeNotes.trim() || undefined,
          skipExisting: rangeSkipExisting,
        },
        (progress) => setRangeProgress(progress)
      );

      setRangeResult(result);
      setRangeFinished(true);
      queryClient.invalidateQueries({ queryKey: ["daily-sales-closure-preview"] });
      queryClient.invalidateQueries({ queryKey: ["daily-sales-closures"] });

      if (result.errors.length > 0) {
        toast.error(
          `Se crearon ${result.created.length} cierres, pero ${result.errors.length} días fallaron`
        );
      } else {
        toast.success(
          `Listo: ${result.created.length} creados, ${result.skipped.length} omitidos` +
            (result.replaced.length > 0 ? `, ${result.replaced.length} reemplazados` : "")
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar los cierres");
    } finally {
      setRangeRunning(false);
    }
  };

  const closeRangeDialog = () => {
    if (rangeRunning) return;
    setRangeConfirmOpen(false);
    setRangeProgress(null);
    setRangeFinished(false);
  };

  const rangeProgressPercent =
    rangeProgress && rangeProgress.total > 0
      ? Math.round((rangeProgress.current / rangeProgress.total) * 100)
      : 0;

  const rangeProgressLabel = (() => {
    if (!rangeProgress) return "Preparando…";
    switch (rangeProgress.action) {
      case "processing":
        return `Procesando ${rangeProgress.businessDate}…`;
      case "skipped":
        return `${rangeProgress.businessDate} — omitido (ya existía)`;
      case "created":
        return `${rangeProgress.businessDate} — cierre creado${rangeProgress.detail ? ` (${rangeProgress.detail})` : ""}`;
      case "replaced":
        return `${rangeProgress.businessDate} — cierre actualizado${rangeProgress.detail ? ` (${rangeProgress.detail})` : ""}`;
      case "error":
        return `${rangeProgress.businessDate} — error${rangeProgress.detail ? `: ${rangeProgress.detail}` : ""}`;
      default:
        return rangeProgress.businessDate;
    }
  })();

  const rangeDayCount = useMemo(() => {
    try {
      return enumerateBusinessDates(rangeFrom, rangeTo).length;
    } catch {
      return null;
    }
  }, [rangeFrom, rangeTo]);

  const rangeInvalid = rangeDayCount === null || rangeDayCount <= 0;

  const alreadyClosed = previewData?.alreadyClosed ?? false;
  const closure = previewData?.closure;
  const preview = previewData?.preview;

  useEffect(() => {
    if (alreadyClosed && closure) {
      setNotes(closure.notes ?? "");
      return;
    }
    if (!alreadyClosed) setNotes("");
  }, [selectedDate, alreadyClosed, closure]);

  const displayData = preview ? mapPreviewToDisplay(preview) : null;

  const savedDiffersFromPreview =
    alreadyClosed &&
    closure &&
    preview &&
    Math.abs(closure.total_sales - preview.totalSales) > 0.01;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cierre de caja diario</CardTitle>
          <CardDescription>
            Registro diario de ventas de cantina (06:00 UTC a 06:00 UTC). No modifica reportes
            existentes; guarda un snapshot para uso futuro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 pb-2">
            <Button variant="secondary" size="sm" disabled>
              Cierre diario
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/monthly-sales-closure">Cierre mensual</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="business-date">Día de negocio</Label>
              <Input
                id="business-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-44"
              />
            </div>
            <p className="text-sm text-muted-foreground pb-2">
              {formatBusinessDayLabel(selectedDate)}
            </p>
          </div>

          {loadingPreview ? (
            <div className="flex justify-center py-10">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : displayData ? (
            <div className="space-y-6">
              {alreadyClosed ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                    <LockIcon className="h-4 w-4 shrink-0" />
                    <span>
                      Cierre guardado
                      {closure?.closed_at
                        ? ` el ${new Date(closure.closed_at).toLocaleString("es-AR")}`
                        : ""}
                      {closure?.revision_count && closure.revision_count > 1
                        ? ` · revisión ${closure.revision_count}`
                        : ""}
                      . Los totales abajo están recalculados con los datos actuales.
                    </span>
                  </div>
                  {savedDiffersFromPreview ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      El cierre guardado tenía ${closure?.total_sales.toFixed(2)} en ventas; el
                      recálculo actual da ${preview?.totalSales.toFixed(2)}. Podés corregir el
                      cierre para actualizar el registro.
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="closure-notes">Notas (opcional)</Label>
                    <Textarea
                      id="closure-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observaciones del cierre"
                      rows={2}
                    />
                  </div>
                  <Button onClick={() => setConfirmOpen(true)}>Corregir cierre</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="closure-notes">Notas (opcional)</Label>
                    <Textarea
                      id="closure-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observaciones del cierre"
                      rows={2}
                    />
                  </div>
                  <Button onClick={() => setConfirmOpen(true)}>Cerrar día</Button>
                </div>
              )}

              <SummaryCards
                totalSales={displayData.totalSales}
                ordersClosedCount={displayData.ordersClosedCount}
                transactionsCount={displayData.transactionsCount}
                totalDiscount={displayData.totalDiscount}
                openOrdersCount={displayData.openOrdersCount}
                openOrdersTotal={displayData.openOrdersTotal}
                zeroAmountOrdersCount={displayData.zeroAmountOrdersCount}
                discountedOrdersCount={displayData.discountedOrdersCount}
              />

              <ClosureDetailTables
                paymentMethods={displayData.paymentMethods}
                products={displayData.products}
                categories={displayData.categories}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRangeIcon className="h-5 w-5" />
            Cierre por rango de fechas
          </CardTitle>
          <CardDescription>
            Generá varios cierres diarios de una vez. Por defecto solo crea los días que aún no
            tienen cierre guardado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="range-from">Desde</Label>
              <Input
                id="range-from"
                type="date"
                value={rangeFrom}
                onChange={(e) => {
                  setRangeFrom(e.target.value);
                  setRangeResult(null);
                }}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to">Hasta</Label>
              <Input
                id="range-to"
                type="date"
                value={rangeTo}
                onChange={(e) => {
                  setRangeTo(e.target.value);
                  setRangeResult(null);
                }}
                className="w-44"
              />
            </div>
            {rangeDayCount !== null && !rangeInvalid ? (
              <p className="text-sm text-muted-foreground pb-2">
                {rangeDayCount} {rangeDayCount === 1 ? "día" : "días"} en el rango
              </p>
            ) : (
              <p className="text-sm text-destructive pb-2">Rango de fechas inválido</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="range-notes">Notas para los cierres (opcional)</Label>
            <Textarea
              id="range-notes"
              value={rangeNotes}
              onChange={(e) => setRangeNotes(e.target.value)}
              placeholder="Ej: Cierre histórico en lote"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="range-skip-existing"
              checked={rangeSkipExisting}
              onCheckedChange={(checked) => setRangeSkipExisting(checked === true)}
            />
            <Label htmlFor="range-skip-existing" className="cursor-pointer font-normal">
              Solo días sin cierre (omitir los que ya existen)
            </Label>
          </div>

          <Button
            onClick={() => {
              setRangeFinished(false);
              setRangeResult(null);
              setRangeConfirmOpen(true);
            }}
            disabled={rangeInvalid || rangeRunning}
          >
            {rangeRunning ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Generando cierres…
              </>
            ) : (
              "Generar cierres del rango"
            )}
          </Button>

          {rangeResult ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
              <p className="font-medium">Resultado del último proceso</p>
              <p>
                Rango: {rangeResult.fromDate} → {rangeResult.toDate} ({rangeResult.totalDays} días)
              </p>
              <p>
                <strong>Creados:</strong> {rangeResult.created.length}
                {" · "}
                <strong>Omitidos:</strong> {rangeResult.skipped.length}
                {" · "}
                <strong>Reemplazados:</strong> {rangeResult.replaced.length}
                {rangeResult.errors.length > 0 ? (
                  <>
                    {" · "}
                    <strong className="text-destructive">Errores:</strong> {rangeResult.errors.length}
                  </>
                ) : null}
              </p>
              {rangeResult.created.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">
                    Ver días creados ({rangeResult.created.length})
                  </summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 pl-4 list-disc">
                    {rangeResult.created.map((row) => (
                      <li key={row.businessDate}>
                        {row.businessDate}: ${row.totalSales.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {rangeResult.errors.length > 0 ? (
                <ul className="text-destructive space-y-1 pl-4 list-disc">
                  {rangeResult.errors.map((row) => (
                    <li key={row.businessDate}>
                      {row.businessDate}: {row.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de cierres</CardTitle>
          <CardDescription>Últimos 30 cierres registrados.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="text-center py-6 text-muted-foreground">Cargando historial…</div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">Todavía no hay cierres.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Día</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Órdenes</TableHead>
                  <TableHead className="text-right">Cuentas abiertas</TableHead>
                  <TableHead>Cerrado</TableHead>
                  <TableHead className="text-right">Rev.</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.business_date}</TableCell>
                    <TableCell className="text-right">${row.total_sales.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{row.orders_closed_count}</TableCell>
                    <TableCell className="text-right">
                      {row.open_orders_count} (${row.open_orders_total.toFixed(2)})
                    </TableCell>
                    <TableCell>
                      {new Date(row.closed_at).toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="text-right">{row.revision_count ?? 1}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryDate(row.business_date)}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {alreadyClosed ? "Confirmar corrección de cierre" : "Confirmar cierre de caja"}
            </DialogTitle>
            <DialogDescription>
              {alreadyClosed
                ? `Se reemplazará el cierre del día ${selectedDate} con los datos recalculados actuales.`
                : `Se guardará el registro de ventas del día ${selectedDate}.`}
            </DialogDescription>
          </DialogHeader>
          {displayData ? (
            <div className="text-sm space-y-1">
              <p>
                <strong>Total ventas:</strong> ${displayData.totalSales.toFixed(2)}
              </p>
              <p>
                <strong>Cuentas abiertas al cierre:</strong> {displayData.openOrdersCount} ($
                {displayData.openOrdersTotal.toFixed(2)})
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending
                ? "Guardando…"
                : alreadyClosed
                ? "Confirmar corrección"
                : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rangeConfirmOpen}
        onOpenChange={(open) => {
          if (!open) closeRangeDialog();
          else setRangeConfirmOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {rangeFinished
                ? "Cierres del rango completados"
                : rangeRunning
                  ? "Generando cierres…"
                  : "Confirmar cierres por rango"}
            </DialogTitle>
            {!rangeRunning && !rangeFinished ? (
              <DialogDescription>
                {rangeSkipExisting
                  ? `Se generarán cierres para los días sin registro entre ${rangeFrom} y ${rangeTo}.`
                  : `Se generarán o reemplazarán cierres para todos los días entre ${rangeFrom} y ${rangeTo}.`}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {!rangeRunning && !rangeFinished ? (
            <>
              <div className="text-sm space-y-1">
                <p>
                  <strong>Días en el rango:</strong> {rangeDayCount ?? "—"}
                </p>
                {rangeNotes.trim() ? (
                  <p>
                    <strong>Notas:</strong> {rangeNotes.trim()}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeRangeDialog}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleRangeBackfill()} disabled={rangeInvalid}>
                  Confirmar
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {rangeRunning || rangeFinished ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {rangeProgress
                      ? `${rangeProgress.current} / ${rangeProgress.total} días`
                      : "Preparando…"}
                  </span>
                  <span className="font-medium tabular-nums">{rangeProgressPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${rangeProgressPercent}%` }}
                  />
                </div>
                <p className="text-sm">{rangeProgressLabel}</p>
              </div>

              {rangeProgress ? (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-md border px-2 py-1.5">
                    <div className="text-muted-foreground">Creados</div>
                    <div className="font-semibold tabular-nums">{rangeProgress.created}</div>
                  </div>
                  <div className="rounded-md border px-2 py-1.5">
                    <div className="text-muted-foreground">Omitidos</div>
                    <div className="font-semibold tabular-nums">{rangeProgress.skipped}</div>
                  </div>
                  <div className="rounded-md border px-2 py-1.5">
                    <div className="text-muted-foreground">Actualizados</div>
                    <div className="font-semibold tabular-nums">{rangeProgress.replaced}</div>
                  </div>
                  <div className="rounded-md border px-2 py-1.5">
                    <div className="text-muted-foreground">Errores</div>
                    <div className="font-semibold tabular-nums text-destructive">
                      {rangeProgress.errors}
                    </div>
                  </div>
                </div>
              ) : null}

              {rangeFinished && rangeResult?.errors.length ? (
                <ul className="max-h-32 overflow-y-auto text-sm text-destructive list-disc pl-4 space-y-1">
                  {rangeResult.errors.map((row) => (
                    <li key={row.businessDate}>
                      {row.businessDate}: {row.error}
                    </li>
                  ))}
                </ul>
              ) : null}

              {rangeRunning ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="h-4 w-4 animate-spin shrink-0" />
                  Procesando un día a la vez…
                </div>
              ) : null}

              {rangeFinished ? (
                <DialogFooter>
                  <Button onClick={closeRangeDialog}>Cerrar</Button>
                </DialogFooter>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyDate)} onOpenChange={(open) => !open && setHistoryDate(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del cierre — {historyDate}</DialogTitle>
          </DialogHeader>
          {loadingHistoryDetail || !historyDetail ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {historyDetail.revision_count && historyDetail.revision_count > 1 ? (
                <p className="text-sm text-muted-foreground">
                  <strong>Revisión:</strong> {historyDetail.revision_count}
                </p>
              ) : null}
              {historyDetail.notes ? (
                <p className="text-sm text-muted-foreground">
                  <strong>Notas:</strong> {historyDetail.notes}
                </p>
              ) : null}
              <SummaryCards
                totalSales={historyDetail.total_sales}
                ordersClosedCount={historyDetail.orders_closed_count}
                transactionsCount={historyDetail.transactions_count}
                totalDiscount={historyDetail.total_discount}
                openOrdersCount={historyDetail.open_orders_count}
                openOrdersTotal={historyDetail.open_orders_total}
                zeroAmountOrdersCount={historyDetail.zero_amount_orders_count}
                discountedOrdersCount={historyDetail.discounted_orders_count}
              />
              <ClosureDetailTables
                paymentMethods={historyDetail.payment_methods}
                products={historyDetail.products}
                categories={historyDetail.categories}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
