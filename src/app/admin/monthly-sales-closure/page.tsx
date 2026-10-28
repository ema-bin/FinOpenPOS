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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2Icon, LockIcon } from "lucide-react";
import { toast } from "sonner";
import { monthlySalesClosuresService } from "@/services/monthly-sales-closures.service";
import { formatDate } from "@/lib/date-utils";
import { formatYearMonthLabel, getCurrentYearMonth } from "@/lib/month-period";
import type {
  MonthlySalesClosureDTO,
  MonthlySalesClosurePreviewDTO,
} from "@/models/dto/monthly-sales-closure";

function mapPreviewToDisplay(preview: NonNullable<MonthlySalesClosurePreviewDTO["preview"]>) {
  return {
    dailyClosuresCount: preview.dailyClosuresCount,
    daysInMonth: preview.daysInMonth,
    missingBusinessDates: preview.missingBusinessDates,
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
    purchases: preview.purchases ?? [],
    totalPurchases: preview.totalPurchases ?? 0,
  };
}

function SummaryCards({
  dailyClosuresCount,
  daysInMonth,
  missingCount,
  totalSales,
  ordersClosedCount,
  transactionsCount,
  totalDiscount,
  openOrdersCount,
  openOrdersTotal,
  zeroAmountOrdersCount,
  discountedOrdersCount,
  totalPurchases = 0,
}: {
  dailyClosuresCount: number;
  daysInMonth: number;
  missingCount: number;
  totalSales: number;
  ordersClosedCount: number;
  transactionsCount: number;
  totalDiscount: number;
  openOrdersCount: number;
  openOrdersTotal: number;
  zeroAmountOrdersCount: number;
  discountedOrdersCount: number;
  totalPurchases?: number;
}) {
  const profit = Math.round((totalSales - totalPurchases) * 100) / 100;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Total ventas del mes</div>
        <div className="text-2xl font-bold text-green-600">${totalSales.toFixed(2)}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Compras del mes</div>
        <div className="text-2xl font-bold text-red-600">${totalPurchases.toFixed(2)}</div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Ganancia cantina</div>
        <div className={`text-2xl font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
          ${profit.toFixed(2)}
        </div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Cierres diarios incluidos</div>
        <div className="text-2xl font-bold">
          {dailyClosuresCount}
          <span className="text-sm font-normal text-muted-foreground ml-2">/ {daysInMonth} días</span>
        </div>
      </div>
      <div className="border rounded-lg p-4">
        <div className="text-xs uppercase text-muted-foreground">Días sin cierre diario</div>
        <div className="text-2xl font-bold">{missingCount}</div>
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
        <div className="text-xs uppercase text-muted-foreground">Cuentas abiertas (último día)</div>
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

function PurchasesSection({
  purchases,
}: {
  purchases: Array<{
    id: number;
    date: string;
    supplierName: string;
    paymentMethodName: string | null;
    totalAmount: number;
  }>;
}) {
  return (
    <div>
      <h3 className="font-semibold mb-2">Compras del mes</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Compras completadas. Se restan de las ventas para la ganancia de la cantina.
      </p>
      {purchases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay compras en este mes.</p>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {purchases.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{row.supplierName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(row.date)}
                    {row.paymentMethodName ? ` · ${row.paymentMethodName}` : ""}
                  </div>
                </div>
                <div className="shrink-0 font-medium">${row.totalAmount.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell>{row.supplierName}</TableCell>
                    <TableCell>{row.paymentMethodName ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${row.totalAmount.toFixed(2)}
                    </TableCell>
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

function DetailTables({
  paymentMethods = [],
  products = [],
  categories = [],
}: {
  paymentMethods?: MonthlySalesClosureDTO["payment_methods"];
  products?: MonthlySalesClosureDTO["products"];
  categories?: MonthlySalesClosureDTO["categories"];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2">Ventas por medio de pago</h3>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <>
          <div className="space-y-2 md:hidden">
            {paymentMethods.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{row.payment_method_name}</div>
                  <div className="text-xs text-muted-foreground">{row.transaction_count} cobros</div>
                </div>
                <div className="shrink-0 font-medium">${row.total_amount.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
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
          </div>
          </>
        )}
      </div>
      <div>
        <h3 className="font-semibold mb-2">Ventas por producto</h3>
        <p className="mb-2 text-sm text-muted-foreground">
          El monto es el precio cobrado, con el descuento de la venta ya aplicado.
        </p>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <>
          <div className="space-y-2 md:hidden">
            {products.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{row.product_name}</div>
                  <div className="text-xs text-muted-foreground">{row.category_name ?? "—"}</div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div>{row.quantity_sold}</div>
                  <div className="font-medium">${row.total_amount.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
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
          </div>
          </>
        )}
      </div>
      <div>
        <h3 className="font-semibold mb-2">Ventas por categoría</h3>
        <p className="mb-2 text-sm text-muted-foreground">
          El monto es el precio cobrado, con el descuento de la venta ya aplicado.
        </p>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          <>
          <div className="space-y-2 md:hidden">
            {categories.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{row.category_name}</div>
                  <div className="text-xs text-muted-foreground">Cant. {row.quantity_sold}</div>
                </div>
                <div className="shrink-0 font-medium">${row.total_amount.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
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
          </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MonthlySalesClosurePage() {
  const queryClient = useQueryClient();
  const defaultMonth = useMemo(() => getCurrentYearMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyMonth, setHistoryMonth] = useState<string | null>(null);

  const { data: previewData, isLoading: loadingPreview, isError, error } = useQuery({
    queryKey: ["monthly-sales-closure-preview", selectedMonth],
    queryFn: () => monthlySalesClosuresService.getPreview(selectedMonth),
    staleTime: 1000 * 15,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["monthly-sales-closures"],
    queryFn: () => monthlySalesClosuresService.list(24),
    staleTime: 1000 * 30,
  });

  const { data: historyDetail, isLoading: loadingHistoryDetail } = useQuery({
    queryKey: ["monthly-sales-closure-detail", historyMonth],
    queryFn: () => monthlySalesClosuresService.getByMonth(historyMonth!),
    enabled: Boolean(historyMonth),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      monthlySalesClosuresService.create({
        yearMonth: selectedMonth,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        result.replaced ? "Cierre mensual corregido" : "Cierre mensual registrado"
      );
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["monthly-sales-closure-preview"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-sales-closures"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const alreadyClosed = previewData?.alreadyClosed ?? false;
  const closure = previewData?.closure;
  const preview = previewData?.preview;

  useEffect(() => {
    if (alreadyClosed && closure) {
      setNotes(closure.notes ?? "");
      return;
    }
    if (!alreadyClosed) setNotes("");
  }, [selectedMonth, alreadyClosed, closure]);

  const displayData = preview ? mapPreviewToDisplay(preview) : null;

  const savedDiffersFromPreview =
    alreadyClosed &&
    closure &&
    preview &&
    Math.abs(closure.total_sales - preview.totalSales) > 0.01;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/daily-sales-closure">Cierre diario</Link>
        </Button>
        <Button variant="secondary" size="sm" disabled>
          Cierre mensual
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cierre de caja mensual</CardTitle>
          <CardDescription>
            Integra los cierres diarios del mes y resta las compras completadas para la ganancia de
            la cantina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4 max-md:w-full max-md:flex-col max-md:items-stretch">
            <div className="space-y-1">
              <Label htmlFor="year-month">Mes</Label>
              <Input
                id="year-month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-44 max-md:w-full"
              />
            </div>
            <p className="text-sm text-muted-foreground pb-2 capitalize">
              {formatYearMonthLabel(selectedMonth)}
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
                      Cierre mensual guardado
                      {closure?.closed_at
                        ? ` el ${new Date(closure.closed_at).toLocaleString("es-AR")}`
                        : ""}
                      {closure?.revision_count && closure.revision_count > 1
                        ? ` · revisión ${closure.revision_count}`
                        : ""}
                      . Los totales abajo se recalculan desde los cierres diarios actuales.
                    </span>
                  </div>
                  {savedDiffersFromPreview ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      El cierre guardado tenía ${closure?.total_sales.toFixed(2)}; el recálculo
                      actual da ${preview?.totalSales.toFixed(2)}.
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="monthly-notes">Notas (opcional)</Label>
                    <Textarea
                      id="monthly-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <Button onClick={() => setConfirmOpen(true)}>Corregir cierre mensual</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayData.missingBusinessDates.length > 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Faltan {displayData.missingBusinessDates.length} cierre(s) diario(s):{" "}
                      {displayData.missingBusinessDates.join(", ")}. El mensual se arma con los{" "}
                      {displayData.dailyClosuresCount} días disponibles.
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="monthly-notes">Notas (opcional)</Label>
                    <Textarea
                      id="monthly-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <Button onClick={() => setConfirmOpen(true)}>Cerrar mes</Button>
                </div>
              )}

              <SummaryCards
                dailyClosuresCount={displayData.dailyClosuresCount}
                daysInMonth={displayData.daysInMonth}
                missingCount={displayData.missingBusinessDates.length}
                totalSales={displayData.totalSales}
                ordersClosedCount={displayData.ordersClosedCount}
                transactionsCount={displayData.transactionsCount}
                totalDiscount={displayData.totalDiscount}
                openOrdersCount={displayData.openOrdersCount}
                openOrdersTotal={displayData.openOrdersTotal}
                zeroAmountOrdersCount={displayData.zeroAmountOrdersCount}
                discountedOrdersCount={displayData.discountedOrdersCount}
                totalPurchases={displayData.totalPurchases}
              />

              <PurchasesSection purchases={displayData.purchases} />

              <DetailTables
                paymentMethods={displayData.paymentMethods}
                products={displayData.products}
                categories={displayData.categories}
              />
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {(error as Error)?.message ?? "No hay cierres diarios para este mes."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Seleccioná un mes.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial mensual</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="text-center py-6 text-muted-foreground">Cargando…</div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">Sin cierres mensuales.</div>
          ) : (
            <>
            <div className="space-y-2 md:hidden">
              {history.map((row) => (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium capitalize">{formatYearMonthLabel(row.year_month)}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.daily_closures_count}/{row.days_in_month} días · Rev. {row.revision_count ?? 1}
                      </div>
                    </div>
                    <div className="shrink-0 font-semibold">${row.total_sales.toFixed(2)}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => setHistoryMonth(row.year_month)}
                  >
                    Ver detalle
                  </Button>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Rev.</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium capitalize">
                      {formatYearMonthLabel(row.year_month)}
                    </TableCell>
                    <TableCell className="text-right">${row.total_sales.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {row.daily_closures_count}/{row.days_in_month}
                    </TableCell>
                    <TableCell className="text-right">{row.revision_count ?? 1}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryMonth(row.year_month)}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {alreadyClosed ? "Confirmar corrección mensual" : "Confirmar cierre mensual"}
            </DialogTitle>
          </DialogHeader>
          {displayData ? (
            <div className="text-sm space-y-1">
              <p>
                <strong>Mes:</strong> {formatYearMonthLabel(selectedMonth)}
              </p>
              <p>
                <strong>Cierres diarios:</strong> {displayData.dailyClosuresCount} de{" "}
                {displayData.daysInMonth}
              </p>
              <p>
                <strong>Total ventas:</strong> ${displayData.totalSales.toFixed(2)}
              </p>
              <p>
                <strong>Compras:</strong> ${displayData.totalPurchases.toFixed(2)}
              </p>
              <p>
                <strong>Ganancia cantina:</strong> $
                {(displayData.totalSales - displayData.totalPurchases).toFixed(2)}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? "Guardando…" : alreadyClosed ? "Confirmar" : "Cerrar mes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyMonth)} onOpenChange={(open) => !open && setHistoryMonth(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {historyMonth ? formatYearMonthLabel(historyMonth) : ""}
            </DialogTitle>
          </DialogHeader>
          {loadingHistoryDetail || !historyDetail ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {historyDetail.included_days && historyDetail.included_days.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  <strong>Días incluidos:</strong>{" "}
                  {historyDetail.included_days.map((d) => d.business_date).join(", ")}
                </p>
              ) : null}
              <SummaryCards
                dailyClosuresCount={historyDetail.daily_closures_count}
                daysInMonth={historyDetail.days_in_month}
                missingCount={historyDetail.missing_days_count}
                totalSales={historyDetail.total_sales}
                ordersClosedCount={historyDetail.orders_closed_count}
                transactionsCount={historyDetail.transactions_count}
                totalDiscount={historyDetail.total_discount}
                openOrdersCount={historyDetail.open_orders_count}
                openOrdersTotal={historyDetail.open_orders_total}
                zeroAmountOrdersCount={historyDetail.zero_amount_orders_count}
                discountedOrdersCount={historyDetail.discounted_orders_count}
                totalPurchases={historyDetail.total_purchases ?? 0}
              />
              <PurchasesSection purchases={historyDetail.purchases ?? []} />
              <DetailTables
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
