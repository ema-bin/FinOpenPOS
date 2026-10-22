"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { classesService, formatPesos } from "@/services/classes.service";
import { classPaymentMethodLabel } from "@/lib/class-payment-methods";
import { summarizeDueClassShares, summarizePaidClassShares } from "@/lib/class-collection-split";
import { buildClassPaymentReminder } from "@/lib/class-payment-reminder";
import { buildWhatsAppUrl, defaultWhatsAppLinkTarget } from "@/lib/whatsapp";
import type { ClassCharge, ClassPaymentMethodRef, MissingClassRateView } from "@/models/db/class";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function personName(person: { first_name: string; last_name: string } | null): string {
  if (!person) return "Jugador";
  return `${person.last_name}, ${person.first_name}`;
}

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesPlayerSearch(charge: ClassCharge, query: string): boolean {
  const needle = foldName(query.trim());
  if (!needle) return true;
  const first = foldName(charge.player?.first_name ?? "");
  const last = foldName(charge.player?.last_name ?? "");
  return first.includes(needle) || last.includes(needle) || `${last} ${first}`.includes(needle);
}

function compareCharges(a: ClassCharge, b: ClassCharge): number {
  const pendingFirst = Number(a.status !== "pending") - Number(b.status !== "pending");
  if (pendingFirst !== 0) return pendingFirst;
  return personName(a.player).localeCompare(personName(b.player), "es");
}

function payChoices(
  charge: ClassCharge,
  professors: Array<{ id: number; payment_method: ClassPaymentMethodRef | null }>,
  cintia: ClassPaymentMethodRef | null,
  cash: ClassPaymentMethodRef | null
): Array<{ id: number; label: string }> {
  const options: Array<{ id: number; label: string }> = [];
  if (cintia) options.push({ id: cintia.id, label: "Transferencia Cintia" });
  const professor = professors.find((item) => item.id === charge.professor_id);
  if (professor?.payment_method && !options.some((option) => option.id === professor.payment_method?.id)) {
    options.push({ id: professor.payment_method.id, label: "Transferencia al profe" });
  }
  if (cash && !options.some((option) => option.id === cash.id)) {
    options.push({ id: cash.id, label: "Efectivo" });
  }
  return options;
}

export function ChargesTab() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const [missing, setMissing] = useState<MissingClassRateView[]>([]);
  const [paying, setPaying] = useState<ClassCharge | null>(null);
  const [editingPayment, setEditingPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [reminding, setReminding] = useState<ClassCharge | null>(null);
  const [reminderMessage, setReminderMessage] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");

  const chargesQuery = useQuery({
    queryKey: ["classes", "charges", month],
    queryFn: () => classesService.listCharges(month),
  });
  const professorsQuery = useQuery({
    queryKey: ["classes", "professors"],
    queryFn: () => classesService.listProfessors(),
  });

  const replaceCharge = (next: ClassCharge) => {
    queryClient.setQueryData(["classes", "charges", month], (current: typeof chargesQuery.data) => {
      if (!current) return current;
      return { ...current, charges: current.charges.map((charge) => (charge.id === next.id ? next : charge)) };
    });
  };

  const generateMutation = useMutation({
    mutationFn: () => classesService.generateCharges(month),
    onSuccess: (result) => {
      setMissing(result.missing);
      queryClient.invalidateQueries({ queryKey: ["classes", "charges", month] });
      toast.success(result.missing.length > 0 ? "Deudas armadas. Faltan tarifas." : "Deudas del mes armadas");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudieron armar las deudas"),
  });

  const amountMutation = useMutation({
    mutationFn: (input: { id: number; amount: number }) => classesService.updateChargeAmount(input.id, input.amount),
    onSuccess: (updated) => {
      replaceCharge(updated);
      toast.success("Monto actualizado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cambiar el monto"),
  });

  const payMutation = useMutation({
    mutationFn: (input: { id: number; paymentMethodId: number }) =>
      classesService.payCharge(input.id, input.paymentMethodId),
    onSuccess: (paid) => {
      replaceCharge(paid);
      setPaying(null);
      toast.success("Pago registrado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cobrar"),
  });

  const editPaymentMutation = useMutation({
    mutationFn: (input: { id: number; amount: number; paymentMethodId: number }) =>
      classesService.updatePayment(input.id, input.amount, input.paymentMethodId),
    onSuccess: (updated) => {
      replaceCharge(updated);
      setPaying(null);
      toast.success("Pago actualizado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo editar el pago"),
  });

  const closeMutation = useMutation({
    mutationFn: (input: { professorId: number; closed: boolean }) =>
      classesService.setMonthClosed(month, input.professorId, input.closed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes", "charges", month] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo actualizar el mes"),
  });

  const charges = chargesQuery.data?.charges ?? [];
  const closedIds = chargesQuery.data?.closedProfessorIds ?? [];
  const professors = professorsQuery.data?.professors ?? [];
  const cash = professorsQuery.data?.cashPaymentMethod ?? null;
  const cintia = professorsQuery.data?.cintiaPaymentMethod ?? null;
  const groups = useMemo(() => {
    const closedProfessorIds = new Set(closedIds);
    const byProfessor = new Map<number, ClassCharge[]>();
    const names = new Map<number, string>();
    for (const professor of professors) {
      names.set(professor.id, professor.name);
      if (professor.is_active) byProfessor.set(professor.id, []);
    }
    for (const charge of charges) {
      const list = byProfessor.get(charge.professor_id) ?? [];
      list.push(charge);
      byProfessor.set(charge.professor_id, list);
    }
    for (const rows of byProfessor.values()) {
      rows.sort(compareCharges);
    }
    return Array.from(byProfessor.entries())
      .map(([professorId, rows]) => ({
        professorId,
        name: rows[0]?.professor?.name ?? names.get(professorId) ?? "Profesor",
        charges: rows,
        closed: closedProfessorIds.has(professorId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [charges, professors, closedIds]);
  const payingOptions = paying ? payChoices(paying, professors, cintia, cash) : [];
  const reminderUrl = reminding
    ? buildWhatsAppUrl(reminding.player?.phone, reminderMessage, defaultWhatsAppLinkTarget())
    : null;

  const openReminder = (charge: ClassCharge) => {
    const professor = professors.find((item) => item.id === charge.professor_id);
    setReminderMessage(
      buildClassPaymentReminder({
        firstName: charge.player?.first_name ?? "",
        yearMonth: charge.year_month,
        professorName: charge.professor?.name ?? professor?.name ?? "el profesor",
        amount: charge.amount,
        account: professor?.payment_method?.account || professor?.payment_method?.name,
      })
    );
    setReminding(charge);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Mes</span>
          <Input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setMissing([]);
            }}
          />
        </label>
        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="block text-muted-foreground">Jugador</span>
          <Input
            value={playerSearch}
            onChange={(event) => setPlayerSearch(event.target.value)}
            placeholder="Nombre o apellido"
          />
        </label>
        <Button onClick={() => generateMutation.mutate()} disabled={!month || generateMutation.isPending}>
          Armar deudas
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Cada profesor se cierra por separado. El reparto es el 60% del profe, el 30% de las canchas y el 10% de Emanuel.
      </p>

      {missing.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Falta la tarifa para estas combinaciones. No se creó la deuda.</p>
          <ul className="mt-2 list-disc pl-5">
            {missing.map((row) => (
              <li key={`${row.player_id}-${row.professor_id}`}>
                {row.player_name} · {row.professor_name} · {row.weekly_count}{" "}
                {row.weekly_count === 1 ? "clase" : "clases"} por semana
              </li>
            ))}
          </ul>
        </div>
      )}

      {chargesQuery.isError && (
        <p className="text-sm text-destructive">
          {chargesQuery.error instanceof Error ? chargesQuery.error.message : "No se pudieron cargar los cobros"}
        </p>
      )}

      {groups.length === 0 && charges.length === 0 && !chargesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">No hay deudas para este mes. Armalas con el botón.</p>
      )}

      {groups.map((group) => {
        const due = summarizeDueClassShares(
          group.charges.map((charge) => ({ amount: charge.amount, professorName: group.name }))
        );
        const collected = summarizePaidClassShares(
          group.charges.map((charge) => ({
            status: charge.status,
            amount: charge.amount,
            professorName: group.name,
            paymentMethodName: classPaymentMethodLabel(charge.payment_method?.name),
            professorShare: charge.professor_share,
            partnersShare: charge.partners_share,
            emanuelShare: charge.emanuel_share,
          }))
        );
        const pendingTotal = group.charges
          .filter((charge) => charge.status === "pending")
          .reduce((total, charge) => total + charge.amount, 0);
        const professorShare = due.byProfessor[0]?.amount ?? 0;
        const visibleCharges = group.charges.filter((charge) => matchesPlayerSearch(charge, playerSearch));
        return (
          <section key={group.professorId} className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{group.name}</h2>
                  <Badge variant={group.closed ? "secondary" : "outline"}>
                    {group.closed ? "Mes cerrado" : "Mes abierto"}
                  </Badge>
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {group.closed
                    ? "Los cobros de este profesor quedaron fijos. Reabrir permite volver a cobrar, cambiar montos y elegir otro destino."
                    : "Cerrar el mes deja fijos los cobros de este profesor: no se pueden cambiar montos, cobrar ni editar el destino, y Armar deudas no los toca."}
                </p>
              </div>
              <Button
                variant={group.closed ? "outline" : "default"}
                onClick={() => closeMutation.mutate({ professorId: group.professorId, closed: !group.closed })}
                disabled={closeMutation.isPending}
              >
                {group.closed ? "Reabrir mes" : "Cerrar mes"}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <MoneyChip label="Cobrado" amount={collected.collected} tone="paid" />
                <MoneyChip label="Falta cobrar" amount={pendingTotal} tone={pendingTotal > 0 ? "due" : "neutral"} />
                <MoneyChip label="Total del mes" amount={due.total} tone="neutral" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobrado por medio</p>
                {collected.byMethod.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay cobros.</p>
                ) : (
                  collected.byMethod.map((row) => (
                    <MoneyChip key={row.name} label={row.name} amount={row.amount} tone="paid" />
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reparto del total</p>
              <div className="flex flex-wrap gap-2">
                <MoneyChip label={`${group.name} · 60%`} amount={professorShare} tone="neutral" />
                <MoneyChip label="Canchas · 30%" amount={due.courts} tone="neutral" />
                <MoneyChip label="Emanuel · 10%" amount={due.emanuel} tone="neutral" />
              </div>
            </div>

            {group.closed && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">De lo cobrado</p>
                <div className="flex flex-wrap gap-2">
                  <MoneyChip label={group.name} amount={collected.professorTotal} tone="paid" />
                  <MoneyChip label="Canchas" amount={collected.partnersTotal} tone="paid" />
                  <MoneyChip label="Emanuel" amount={collected.emanuelTotal} tone="paid" />
                </div>
              </div>
            )}
            {group.charges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin deudas este mes.</p>
            ) : visibleCharges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ningún jugador coincide con la búsqueda.</p>
            ) : (
            <>
            <div className="space-y-2 md:hidden">
              {visibleCharges.map((charge) => {
                const pending = charge.status === "pending";
                return (
                  <div
                    key={charge.id}
                    className={`space-y-2 rounded-md border p-3 ${pending ? "border-red-200 bg-red-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-medium ${pending ? "text-red-900" : ""}`}>{personName(charge.player)}</p>
                        <p className="text-sm text-muted-foreground">{charge.weekly_count} clases/sem</p>
                      </div>
                      <Badge variant={pending ? "expense" : "income"}>{pending ? "Pendiente" : "Paga"}</Badge>
                    </div>
                    <div className={pending ? "text-red-700" : undefined}>
                      {pending && !group.closed ? (
                        <AmountField
                          amount={charge.amount}
                          disabled={amountMutation.isPending}
                          onSave={(amount) => amountMutation.mutate({ id: charge.id, amount })}
                        />
                      ) : (
                        <span className={pending ? "font-semibold" : undefined}>{formatPesos(charge.amount)}</span>
                      )}
                    </div>
                    {charge.status === "paid" && (
                      <p className="text-sm">{classPaymentMethodLabel(charge.payment_method?.name)}</p>
                    )}
                    <ChargeActions
                      charge={charge}
                      closed={group.closed}
                      professors={professors}
                      cintia={cintia}
                      cash={cash}
                      payPending={payMutation.isPending}
                      editPending={editPaymentMutation.isPending}
                      onRemind={openReminder}
                      onPay={(next) => {
                        const options = payChoices(next, professors, cintia, cash);
                        setEditingPayment(false);
                        setPayAmount(String(next.amount));
                        setPaying(next);
                        setMethodId(options[0] ? String(options[0].id) : "");
                      }}
                      onEdit={(next, methodId) => {
                        setEditingPayment(true);
                        setPayAmount(String(next.amount));
                        setPaying(next);
                        setMethodId(methodId);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jugador</TableHead>
                  <TableHead>Clases/sem</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCharges.map((charge) => {
                  const pending = charge.status === "pending";
                  const hasPhone = Boolean(charge.player?.phone?.trim());
                  return (
                  <TableRow key={charge.id} className={pending ? "bg-red-50 hover:bg-red-100/80" : undefined}>
                    <TableCell className={pending ? "font-medium text-red-900" : undefined}>
                      {personName(charge.player)}
                    </TableCell>
                    <TableCell>{charge.weekly_count}</TableCell>
                    <TableCell className={pending ? "text-red-700" : undefined}>
                      {pending && !group.closed ? (
                        <AmountField
                          amount={charge.amount}
                          disabled={amountMutation.isPending}
                          onSave={(amount) => amountMutation.mutate({ id: charge.id, amount })}
                        />
                      ) : (
                        <span className={pending ? "font-semibold" : undefined}>{formatPesos(charge.amount)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {charge.status === "paid" ? classPaymentMethodLabel(charge.payment_method?.name) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pending ? "expense" : "income"}>{pending ? "Pendiente" : "Paga"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {pending && (
                          <span title={hasPhone ? "Enviar recordatorio de pago por WhatsApp" : "El jugador no tiene teléfono cargado"}>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!hasPhone}
                              onClick={() => openReminder(charge)}
                            >
                              <MessageCircleIcon className="mr-1 h-4 w-4" />
                              Recordar
                            </Button>
                          </span>
                        )}
                        {pending && !group.closed && (
                          <Button
                            size="sm"
                            onClick={() => {
                              const options = payChoices(charge, professors, cintia, cash);
                              setEditingPayment(false);
                              setPayAmount(String(charge.amount));
                              setPaying(charge);
                              setMethodId(options[0] ? String(options[0].id) : "");
                            }}
                            disabled={payMutation.isPending}
                          >
                            Cobrar
                          </Button>
                        )}
                        {charge.status === "paid" && !group.closed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const options = payChoices(charge, professors, cintia, cash);
                              const current = charge.payment_method?.id;
                              setEditingPayment(true);
                              setPayAmount(String(charge.amount));
                              setPaying(charge);
                              setMethodId(
                                current && options.some((option) => option.id === current)
                                  ? String(current)
                                  : options[0]
                                    ? String(options[0].id)
                                    : ""
                              );
                            }}
                            disabled={editPaymentMutation.isPending}
                          >
                            Editar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            </>
            )}
          </section>
        );
      })}

      <Dialog open={reminding !== null} onOpenChange={(open) => !open && setReminding(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Recordatorio de pago</DialogTitle>
          </DialogHeader>
          {reminding && (
            <div className="space-y-3 text-sm">
              <p>
                {personName(reminding.player)} · {reminding.professor?.name ?? "Profesor"} ·{" "}
                <span className="font-semibold text-red-700">{formatPesos(reminding.amount)}</span>
              </p>
              <Textarea
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">Podés editar el texto antes de enviarlo.</p>
              {!reminderUrl && (
                <p className="text-sm text-destructive">
                  {reminding.player?.phone?.trim()
                    ? `El teléfono "${reminding.player.phone}" no es válido para WhatsApp.`
                    : "El jugador no tiene teléfono cargado."}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReminding(null)}>
              Cancelar
            </Button>
            {reminderUrl ? (
              <Button type="button" asChild>
                <a href={reminderUrl} onClick={() => setReminding(null)}>
                  <MessageCircleIcon className="mr-2 h-4 w-4" />
                  Enviar WhatsApp
                </a>
              </Button>
            ) : (
              <Button type="button" disabled>
                <MessageCircleIcon className="mr-2 h-4 w-4" />
                Enviar WhatsApp
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paying !== null} onOpenChange={(open) => !open && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Editar pago" : "Cobrar clase"}</DialogTitle>
          </DialogHeader>
          {paying && (
            <div className="space-y-3 text-sm">
              <p>
                {personName(paying.player)} · {paying.professor?.name ?? "Profesor"}
                {editingPayment ? "" : ` · ${formatPesos(paying.amount)}`}
              </p>
              {editingPayment && (
                <label className="block space-y-1">
                  <span className="text-muted-foreground">Monto</span>
                  <Input
                    type="number"
                    min="0"
                    value={payAmount}
                    onChange={(event) => setPayAmount(event.target.value)}
                  />
                </label>
              )}
              <Select value={methodId || undefined} onValueChange={setMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Dónde se pagó" />
                </SelectTrigger>
                <SelectContent>
                  {payingOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                if (!paying || !methodId) return;
                if (editingPayment) {
                  const amount = Number(payAmount);
                  if (!Number.isFinite(amount) || amount < 0) {
                    toast.error("El monto no es válido");
                    return;
                  }
                  editPaymentMutation.mutate({ id: paying.id, amount, paymentMethodId: Number(methodId) });
                  return;
                }
                payMutation.mutate({ id: paying.id, paymentMethodId: Number(methodId) });
              }}
              disabled={!methodId || payMutation.isPending || editPaymentMutation.isPending}
            >
              {editingPayment ? "Guardar" : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MoneyChip({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: "paid" | "due" | "neutral";
}) {
  const toneClass =
    tone === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "due"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-border bg-muted/50 text-foreground";
  return (
    <div className={`min-w-[8.5rem] rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-75">{label}</p>
      <p className="text-base font-semibold">{formatPesos(amount)}</p>
    </div>
  );
}

function ChargeActions({
  charge,
  closed,
  professors,
  cintia,
  cash,
  payPending,
  editPending,
  onRemind,
  onPay,
  onEdit,
}: {
  charge: ClassCharge;
  closed: boolean;
  professors: Array<{ id: number; payment_method: ClassPaymentMethodRef | null }>;
  cintia: ClassPaymentMethodRef | null;
  cash: ClassPaymentMethodRef | null;
  payPending: boolean;
  editPending: boolean;
  onRemind: (charge: ClassCharge) => void;
  onPay: (charge: ClassCharge) => void;
  onEdit: (charge: ClassCharge, methodId: string) => void;
}) {
  const pending = charge.status === "pending";
  const hasPhone = Boolean(charge.player?.phone?.trim());
  return (
    <div className="flex flex-wrap gap-2">
      {pending && (
        <span title={hasPhone ? "Enviar recordatorio de pago por WhatsApp" : "El jugador no tiene teléfono cargado"}>
          <Button size="sm" variant="outline" disabled={!hasPhone} onClick={() => onRemind(charge)}>
            <MessageCircleIcon className="mr-1 h-4 w-4" />
            Recordar
          </Button>
        </span>
      )}
      {pending && !closed && (
        <Button size="sm" onClick={() => onPay(charge)} disabled={payPending}>
          Cobrar
        </Button>
      )}
      {charge.status === "paid" && !closed && (
        <Button
          size="sm"
          variant="outline"
          disabled={editPending}
          onClick={() => {
            const options = payChoices(charge, professors, cintia, cash);
            const current = charge.payment_method?.id;
            onEdit(
              charge,
              current && options.some((option) => option.id === current)
                ? String(current)
                : options[0]
                  ? String(options[0].id)
                  : ""
            );
          }}
        >
          Editar
        </Button>
      )}
    </div>
  );
}

function AmountField({
  amount,
  disabled,
  onSave,
}: {
  amount: number;
  disabled: boolean;
  onSave: (amount: number) => void;
}) {
  const [value, setValue] = useState(String(amount));

  useEffect(() => {
    setValue(String(amount));
  }, [amount]);

  return (
    <Input
      type="number"
      min="0"
      className="h-8 w-28"
      value={value}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const next = Number(value);
        if (!Number.isFinite(next) || next < 0 || next === amount) {
          setValue(String(amount));
          return;
        }
        onSave(next);
      }}
    />
  );
}
