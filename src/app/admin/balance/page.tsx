"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { transactionsService } from "@/services/transactions.service";
import { partnersService, type PartnerDTO } from "@/services/partners.service";
import { paymentMethodsService } from "@/services/purchases.service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";

type BalanceByPaymentMethod = {
  payment_method_id: number | null;
  payment_method_name: string | null;
  incomes: number;
  expenses: number;
  withdrawals: number;
  adjustments: number;
  balance: number;
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type MonthOption = { value: string; label: string; from: string; to: string };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthRange(year: number, monthIndex: number): MonthOption {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    value: `${year}-${pad(monthIndex + 1)}`,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    from: `${year}-${pad(monthIndex + 1)}-01`,
    to: `${year}-${pad(monthIndex + 1)}-${pad(lastDay)}`,
  };
}

function buildMonthOptions(now = new Date()): MonthOption[] {
  const options: MonthOption[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now.getFullYear() - 1, 0, 1);
  while (cursor >= start) {
    options.push(monthRange(cursor.getFullYear(), cursor.getMonth()));
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return options;
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toDateInputValue(iso: string): string {
  let normalized = iso.trim();
  if (
    !normalized.endsWith("Z") &&
    !/[+-]\d{2}:?\d{2}$/.test(normalized) &&
    normalized.includes("T")
  ) {
    normalized += "Z";
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function WithdrawalDateField({
  createdAt,
  pending,
  onSave,
}: {
  createdAt: string;
  pending: boolean;
  onSave: (date: string) => void;
}) {
  const saved = toDateInputValue(createdAt);
  const [value, setValue] = useState(saved);
  const dirty = value !== "" && value !== saved;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        aria-label="Fecha del retiro"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-40 max-md:w-full"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!dirty || pending}
        onClick={() => onSave(value)}
      >
        Guardar fecha
      </Button>
    </div>
  );
}

function AccountBalances({ rows }: { rows: BalanceByPaymentMethod[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin movimientos en este período.</p>;
  }

  const totals = rows.reduce(
    (sum, row) => ({
      incomes: sum.incomes + row.incomes,
      expenses: sum.expenses + row.expenses,
      withdrawals: sum.withdrawals + row.withdrawals,
      adjustments: sum.adjustments + row.adjustments,
      balance: sum.balance + row.balance,
    }),
    { incomes: 0, expenses: 0, withdrawals: 0, adjustments: 0, balance: 0 }
  );

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row, index) => (
          <div key={row.payment_method_id ?? `none-${index}`} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-medium">{row.payment_method_name || "Sin método de pago"}</div>
              <div className={`shrink-0 font-bold ${row.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {money(row.balance)}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
              <span className="text-green-600">Ventas {money(row.incomes)}</span>
              <span className="text-right text-red-600">Compras {money(row.expenses)}</span>
              <span className="text-red-600">Retiros {money(row.withdrawals)}</span>
              <span className="text-right text-blue-600">Ajustes {money(row.adjustments)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Ventas</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Retiros</TableHead>
              <TableHead className="text-right">Ajustes</TableHead>
              <TableHead className="text-right">Debería haber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.payment_method_id ?? `none-${index}`}>
                <TableCell className="font-medium">{row.payment_method_name || "Sin método de pago"}</TableCell>
                <TableCell className="text-right text-green-600">{money(row.incomes)}</TableCell>
                <TableCell className="text-right text-red-600">{money(row.expenses)}</TableCell>
                <TableCell className="text-right text-red-600">{money(row.withdrawals)}</TableCell>
                <TableCell className="text-right text-blue-600">{money(row.adjustments)}</TableCell>
                <TableCell className={`text-right font-bold ${row.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {money(row.balance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-bold">Total</TableCell>
              <TableCell className="text-right font-bold text-green-600">{money(totals.incomes)}</TableCell>
              <TableCell className="text-right font-bold text-red-600">{money(totals.expenses)}</TableCell>
              <TableCell className="text-right font-bold text-red-600">{money(totals.withdrawals)}</TableCell>
              <TableCell className="text-right font-bold text-blue-600">{money(totals.adjustments)}</TableCell>
              <TableCell className={`text-right font-bold ${totals.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {money(totals.balance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function MethodBreakdown({
  rows,
  tone,
}: {
  rows: Array<{ key: string; name: string; amount: number }>;
  tone: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin movimientos en este período.</p>;
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <span className="min-w-0 font-medium">{row.name}</span>
            <span className={`shrink-0 font-semibold ${tone}`}>{money(row.amount)}</span>
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Método de pago</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.name}</TableCell>
                <TableCell className={`text-right font-medium ${tone}`}>{money(row.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function BalancePage() {
  const queryClient = useQueryClient();
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDescription, setAdjustmentDescription] = useState("");
  const [adjustmentPaymentMethodId, setAdjustmentPaymentMethodId] = useState<string>("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalDescription, setWithdrawalDescription] = useState("");
  const [withdrawalPlayerId, setWithdrawalPlayerId] = useState<string>("");
  const [withdrawalPaymentMethodId, setWithdrawalPaymentMethodId] = useState<string>("");
  const [withdrawalDate, setWithdrawalDate] = useState(todayInputValue);
  const [monthKey, setMonthKey] = useState(monthOptions[0]?.value ?? "all");
  const [dateFrom, setDateFrom] = useState(monthOptions[0]?.from ?? "");
  const [dateTo, setDateTo] = useState(monthOptions[0]?.to ?? "");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions-balance", dateFrom, dateTo],
    queryFn: () =>
      transactionsService.getBalance({
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      }),
    staleTime: 1000 * 30,
  });

  // Cargar socios activos
  const { data: partners = [] } = useQuery({
    queryKey: ["partners"],
    queryFn: () => partnersService.getAll(true), // solo activos
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  // Cargar métodos de pago (para scope BAR)
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["payment-methods", "BAR"],
    queryFn: () => paymentMethodsService.getAll(true, "BAR"),
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const buildTimestamp = (date: string, endOfDay = false) =>
    date ? `${date}${endOfDay ? "T23:59:59" : "T00:00:00"}` : undefined;

  const { data: partnerWithdrawals = [], isLoading: loadingWithdrawals } = useQuery({
    queryKey: ["partner-withdrawals", dateFrom, dateTo, partnerFilter],
    queryFn: () =>
      transactionsService.getAll({
        type: "withdrawal",
        from: buildTimestamp(dateFrom),
        to: buildTimestamp(dateTo, true),
        partnerId: partnerFilter && partnerFilter !== "all" ? Number(partnerFilter) : undefined,
      }),
    staleTime: 1000 * 30,
  });

  const { data: adjustmentsList = [], isLoading: loadingAdjustments } = useQuery({
    queryKey: ["adjustments", dateFrom, dateTo],
    queryFn: () =>
      transactionsService.getAll({
        type: "adjustment",
        from: buildTimestamp(dateFrom),
        to: buildTimestamp(dateTo, true),
      }),
    staleTime: 1000 * 30,
  });

  const withdrawalsSummary = useMemo(() => {
    const map = new Map<string, { label: string; amount: number }>();
    partnerWithdrawals.forEach((withdrawal) => {
      const key =
        withdrawal.partner?.id?.toString() ||
        (withdrawal.partner_id ? withdrawal.partner_id.toString() : "none");
      const label = withdrawal.partner
        ? `${withdrawal.partner.first_name} ${withdrawal.partner.last_name}`
        : withdrawal.partner_id
        ? `ID ${withdrawal.partner_id}`
        : "Sin socio";
      const current = map.get(key);
      if (current) {
        current.amount += withdrawal.amount;
      } else {
        map.set(key, { label, amount: withdrawal.amount });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [partnerWithdrawals]);

  const adjustmentMutation = useMutation({
    mutationFn: () =>
      transactionsService.createAdjustment({
        amount: Number(adjustmentAmount),
        description: adjustmentDescription.trim(),
        payment_method_id: Number(adjustmentPaymentMethodId),
      }),
    onSuccess: () => {
      toast.success("Ajuste registrado");
      setAdjustmentAmount("");
      setAdjustmentDescription("");
      setAdjustmentPaymentMethodId("");
      setIsAdjustmentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["transactions-balance"] });
      queryClient.invalidateQueries({ queryKey: ["adjustments"] });
    },
    onError: () => toast.error("No se pudo registrar el ajuste"),
  });

  const withdrawalMutation = useMutation({
    mutationFn: () =>
      transactionsService.createWithdrawal({
        amount: Number(withdrawalAmount),
        description: withdrawalDescription.trim(),
        player_id: Number(withdrawalPlayerId),
        payment_method_id: withdrawalPaymentMethodId ? Number(withdrawalPaymentMethodId) : null,
        withdrawalDate,
      }),
    onSuccess: () => {
      toast.success("Retiro registrado");
      setWithdrawalAmount("");
      setWithdrawalDescription("");
      setWithdrawalPlayerId("");
      setWithdrawalPaymentMethodId("");
      setWithdrawalDate(todayInputValue());
      setIsWithdrawalDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["transactions-balance"] });
      queryClient.invalidateQueries({ queryKey: ["partner-withdrawals"] });
    },
    onError: () => toast.error("No se pudo registrar el retiro"),
  });

  const updateWithdrawalDateMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      transactionsService.updateWithdrawalDate(id, date),
    onSuccess: () => {
      toast.success("Fecha del retiro actualizada");
      queryClient.invalidateQueries({ queryKey: ["transactions-balance"] });
      queryClient.invalidateQueries({ queryKey: ["partner-withdrawals"] });
    },
    onError: () => toast.error("No se pudo cambiar la fecha del retiro"),
  });

  const parsedWithdrawalAmount = Number(withdrawalAmount);
  const withdrawalAmountValid =
    withdrawalAmount !== "" &&
    !Number.isNaN(parsedWithdrawalAmount) &&
    parsedWithdrawalAmount > 0;

  const handleSaveAdjustment = () => {
    if (!adjustmentAmount || Number.isNaN(Number(adjustmentAmount))) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!adjustmentDescription.trim()) {
      toast.error("Ingresá una descripción");
      return;
    }
    if (!adjustmentPaymentMethodId) {
      toast.error("Seleccioná un método de pago");
      return;
    }
    adjustmentMutation.mutate();
  };

  const handleSaveWithdrawal = () => {
    if (!withdrawalPlayerId) {
      toast.error("Seleccioná un socio");
      return;
    }
    if (!withdrawalAmountValid) {
      toast.error("El monto a retirar debe ser mayor a 0");
      return;
    }
    if (!withdrawalDescription.trim()) {
      toast.error("Ingresá una descripción");
      return;
    }
    if (!withdrawalDate) {
      toast.error("Elegí la fecha del retiro");
      return;
    }
    withdrawalMutation.mutate();
  };

  const summary = data?.summary ?? {};
  const balanceByPaymentMethod: BalanceByPaymentMethod[] = data?.balanceByPaymentMethod ?? [];
  const sales = Number(summary.income) || 0;
  const purchases = Number(summary.expense) || 0;
  const withdrawals = Number(summary.withdrawal) || 0;
  const adjustments = Number(summary.adjustment) || 0;
  const saldo = sales - purchases - withdrawals + adjustments;

  const applyMonth = (value: string) => {
    setMonthKey(value);
    if (value === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    if (value === "custom") return;
    const month = monthOptions.find((option) => option.value === value);
    if (!month) return;
    setDateFrom(month.from);
    setDateTo(month.to);
  };

  const syncMonthFromDates = (from: string, to: string) => {
    const match = monthOptions.find((option) => option.from === from && option.to === to);
    setMonthKey(match?.value ?? (from || to ? "custom" : "all"));
  };

  const methodRows = (
    pick: (method: BalanceByPaymentMethod) => number
  ): Array<{ key: string; name: string; amount: number }> =>
    balanceByPaymentMethod
      .map((method, index) => ({
        key: method.payment_method_id?.toString() ?? `none-${index}`,
        name: method.payment_method_name || "Sin método de pago",
        amount: pick(method),
      }))
      .filter((row) => Math.abs(row.amount) > 0.004)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2 max-md:flex-col max-md:items-stretch">
            <div>
              <CardTitle>Balance</CardTitle>
              <CardDescription>
                Ventas, compras, retiros y ajustes, tomados de las transacciones.
              </CardDescription>
            </div>
            <div className="flex gap-2 max-md:flex-col">
              <Button className="max-md:w-full" onClick={() => setIsAdjustmentDialogOpen(true)}>Registrar ajuste</Button>
              <Button variant="outline" className="max-md:w-full" onClick={() => setIsWithdrawalDialogOpen(true)}>
                Registrar retiro
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 max-md:w-full max-md:flex-col max-md:items-stretch">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Mes</span>
              <Select value={monthKey} onValueChange={applyMonth}>
                <SelectTrigger className="w-52 max-md:w-full">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  <SelectItem value="all">Todo el período</SelectItem>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Desde</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateFrom(value);
                  syncMonthFromDates(value, dateTo);
                }}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Hasta</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateTo(value);
                  syncMonthFromDates(dateFrom, value);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 text-center text-muted-foreground">Cargando balance...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-4 shadow-sm">
                  <div className="text-xs uppercase text-muted-foreground">Ventas</div>
                  <div className="text-2xl font-bold text-green-600">{money(sales)}</div>
                </div>
                <div className="rounded-lg border p-4 shadow-sm">
                  <div className="text-xs uppercase text-muted-foreground">Compras</div>
                  <div className="text-2xl font-bold text-red-600">{money(purchases)}</div>
                </div>
                <div className="rounded-lg border p-4 shadow-sm">
                  <div className="text-xs uppercase text-muted-foreground">Retiros de socios</div>
                  <div className="text-2xl font-bold text-red-600">{money(withdrawals)}</div>
                </div>
                <div className="rounded-lg border p-4 shadow-sm">
                  <div className="text-xs uppercase text-muted-foreground">Ajustes</div>
                  <div className="text-2xl font-bold text-blue-600">{money(adjustments)}</div>
                  <a href="#ajustes" className="mt-1 inline-block text-sm text-blue-700 underline">
                    Ver detalle
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Saldo</div>
                  <div className="text-sm text-muted-foreground">Ventas − compras − retiros + ajustes</div>
                </div>
                <div className={`text-2xl font-bold ${saldo >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {money(saldo)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo por cuenta</CardTitle>
          <CardDescription>
            Lo que debería haber en cada cuenta: ventas − compras − retiros + ajustes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountBalances
            rows={[...balanceByPaymentMethod].sort((a, b) => b.balance - a.balance)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ventas</CardTitle>
          <CardDescription>Ingresos de las ventas, por método de pago. No incluye cobros de clases.</CardDescription>
        </CardHeader>
        <CardContent>
          <MethodBreakdown rows={methodRows((method) => method.incomes)} tone="text-green-600" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compras</CardTitle>
          <CardDescription>Gastos de compras, por método de pago.</CardDescription>
        </CardHeader>
        <CardContent>
          <MethodBreakdown rows={methodRows((method) => method.expenses)} tone="text-red-600" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Retiros de socios</CardTitle>
            <CardDescription>
              Total del período por método de pago, y el detalle de cada retiro.
            </CardDescription>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Socio</span>
            <Select value={partnerFilter} onValueChange={(value) => setPartnerFilter(value)}>
              <SelectTrigger className="w-52 max-md:w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id.toString()}>
                    {partner.first_name} {partner.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <MethodBreakdown rows={methodRows((method) => method.withdrawals)} tone="text-red-600" />
          {loadingWithdrawals ? (
            <div className="text-center py-6 text-muted-foreground">Cargando retiros...</div>
          ) : partnerWithdrawals.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              No se encontraron retiros para los filtros seleccionados.
            </div>
          ) : (
            <>
            <div className="space-y-2 md:hidden">
              {partnerWithdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {withdrawal.partner
                          ? `${withdrawal.partner.first_name} ${withdrawal.partner.last_name}`
                          : withdrawal.partner_id
                          ? `ID ${withdrawal.partner_id}`
                          : "Sin socio"}
                      </div>
                      <div className="mt-2">
                        <WithdrawalDateField
                          key={`${withdrawal.id}-${withdrawal.created_at}`}
                          createdAt={withdrawal.created_at}
                          pending={updateWithdrawalDateMutation.isPending}
                          onSave={(date) =>
                            updateWithdrawalDateMutation.mutate({ id: withdrawal.id, date })
                          }
                        />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {withdrawal.payment_method?.name || "Sin método"}
                      </div>
                      {withdrawal.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{withdrawal.description}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">${withdrawal.amount.toFixed(2)}</div>
                      <div className="text-xs capitalize text-muted-foreground">{withdrawal.status}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Socio</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="hidden md:table-cell">Descripción</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerWithdrawals.map((withdrawal) => (
                    <TableRow key={withdrawal.id}>
                      <TableCell>
                        <WithdrawalDateField
                          key={`${withdrawal.id}-${withdrawal.created_at}`}
                          createdAt={withdrawal.created_at}
                          pending={updateWithdrawalDateMutation.isPending}
                          onSave={(date) =>
                            updateWithdrawalDateMutation.mutate({ id: withdrawal.id, date })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {withdrawal.partner
                          ? `${withdrawal.partner.first_name} ${withdrawal.partner.last_name}`
                          : withdrawal.partner_id
                          ? `ID ${withdrawal.partner_id}`
                          : "Sin socio"}
                      </TableCell>
                      <TableCell className="font-semibold text-right">
                        ${withdrawal.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {withdrawal.payment_method?.name || "Sin método"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {withdrawal.description || "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            withdrawal.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {withdrawal.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
          {withdrawalsSummary.length > 0 && (
          <div className="border-t pt-4 text-sm space-y-4">
            <div className="font-semibold">Resumen de retiros por socio</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {withdrawalsSummary.map((entry) => (
                <div
                  key={entry.label}
                  className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-2"
                >
                  <span className="text-xs text-muted-foreground">{entry.label}</span>
                  <span className="font-semibold">${entry.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      <Card id="ajustes">
        <CardHeader>
          <CardTitle>Ajustes</CardTitle>
          <CardDescription>Cada ajuste del período, con fecha, cuenta y descripción.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MethodBreakdown rows={methodRows((method) => method.adjustments)} tone="text-blue-600" />
          {loadingAdjustments ? (
            <div className="text-center py-6 text-muted-foreground">Cargando ajustes...</div>
          ) : adjustmentsList.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              No hay ajustes en este período.
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {adjustmentsList.map((adjustment) => (
                  <div key={adjustment.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{adjustment.description || "Sin descripción"}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(adjustment.created_at).toLocaleString("es-AR")}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {adjustment.payment_method?.name || "Sin método"}
                        </div>
                      </div>
                      <div className="shrink-0 font-semibold text-blue-600">{money(adjustment.amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustmentsList.map((adjustment) => (
                      <TableRow key={adjustment.id}>
                        <TableCell>{new Date(adjustment.created_at).toLocaleString("es-AR")}</TableCell>
                        <TableCell>{adjustment.description || "Sin descripción"}</TableCell>
                        <TableCell>{adjustment.payment_method?.name || "Sin método"}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-600">
                          {money(adjustment.amount)}
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

      <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar ajuste</DialogTitle>
            <DialogDescription>Ingresá el monto, método de pago y detalle del ajuste.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adjustment-amount">Monto</Label>
              <Input
                id="adjustment-amount"
                type="number"
                placeholder="Monto"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-payment-method">
                Método de pago <span className="text-destructive">*</span>
              </Label>
              <Select
                value={adjustmentPaymentMethodId || undefined}
                onValueChange={(value) => setAdjustmentPaymentMethodId(value)}
              >
                <SelectTrigger id="adjustment-payment-method">
                  <SelectValue placeholder="Seleccionar método de pago" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id.toString()}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-description">Descripción</Label>
              <Input
                id="adjustment-description"
                placeholder="Descripción del ajuste"
                value={adjustmentDescription}
                onChange={(e) => setAdjustmentDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsAdjustmentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveAdjustment}
              disabled={
                adjustmentMutation.isPending ||
                !adjustmentAmount ||
                !adjustmentDescription.trim() ||
                !adjustmentPaymentMethodId
              }
            >
              {adjustmentMutation.isPending ? "Guardando..." : "Guardar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar retiro</DialogTitle>
            <DialogDescription>Seleccioná el socio y registrá el retiro con descripción.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="withdrawal-player">Socio</Label>
              <Select
                value={withdrawalPlayerId}
                onValueChange={(value) => setWithdrawalPlayerId(value)}
              >
                <SelectTrigger id="withdrawal-player">
                  <SelectValue placeholder="Seleccionar socio" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((partner: PartnerDTO) => (
                    <SelectItem key={partner.id} value={partner.id.toString()}>
                      {partner.first_name} {partner.last_name} {partner.phone && `- ${partner.phone}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-date">Fecha</Label>
              <Input
                id="withdrawal-date"
                type="date"
                value={withdrawalDate}
                onChange={(event) => setWithdrawalDate(event.target.value)}
                className="w-44 max-md:w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-amount">
                Monto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="withdrawal-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Monto mayor a 0"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-payment-method">Método de Pago</Label>
              <Select
                value={withdrawalPaymentMethodId || undefined}
                onValueChange={(value) => setWithdrawalPaymentMethodId(value)}
              >
                <SelectTrigger id="withdrawal-payment-method">
                  <SelectValue placeholder="Seleccionar método de pago (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id.toString()}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-description">Descripción</Label>
              <Input
                id="withdrawal-description"
                placeholder="Descripción del retiro"
                value={withdrawalDescription}
                onChange={(e) => setWithdrawalDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsWithdrawalDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveWithdrawal}
              disabled={
                withdrawalMutation.isPending ||
                !withdrawalAmountValid ||
                !withdrawalDescription.trim() ||
                !withdrawalPlayerId ||
                !withdrawalDate
              }
            >
              {withdrawalMutation.isPending ? "Guardando..." : "Guardar retiro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
