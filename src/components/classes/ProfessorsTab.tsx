"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classesService, formatPesos } from "@/services/classes.service";

export function ProfessorsTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [rateCount, setRateCount] = useState<Record<number, string>>({});
  const [rateAmount, setRateAmount] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPaymentMethodId, setEditPaymentMethodId] = useState("");
  const [editAccount, setEditAccount] = useState("");

  const query = useQuery({
    queryKey: ["classes", "professors"],
    queryFn: () => classesService.listProfessors(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["classes", "professors"] });

  const createMutation = useMutation({
    mutationFn: () =>
      classesService.createProfessor({
        name,
        phone,
        paymentMethodId: Number(paymentMethodId),
      }),
    onSuccess: () => {
      setName("");
      setPhone("");
      toast.success("Profesor guardado");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      id: number;
      name?: string;
      phone?: string;
      isActive?: boolean;
      paymentMethodId?: number;
      paymentAccount?: string;
    }) =>
      classesService.updateProfessor(input.id, {
        name: input.name,
        phone: input.phone,
        isActive: input.isActive,
        paymentMethodId: input.paymentMethodId,
        paymentAccount: input.paymentAccount,
      }),
    onSuccess: () => {
      setEditingId(null);
      toast.success("Profesor actualizado");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo actualizar"),
  });

  const rateMutation = useMutation({
    mutationFn: (input: { professorId: number; weeklyCount: number; monthlyAmount: number }) =>
      classesService.saveRate(input.professorId, input.weeklyCount, input.monthlyAmount),
    onSuccess: (_data, input) => {
      setRateCount((current) => ({ ...current, [input.professorId]: "" }));
      setRateAmount((current) => ({ ...current, [input.professorId]: "" }));
      toast.success("Tarifa guardada");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar la tarifa"),
  });

  const deleteRateMutation = useMutation({
    mutationFn: (id: number) => classesService.deleteRate(id),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo borrar"),
  });

  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : "No se pudieron cargar los profesores"}
      </p>
    );
  }

  const professors = query.data?.professors ?? [];
  const paymentMethods = query.data?.paymentMethods ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo profesor</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" />
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Teléfono" />
          <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
            <SelectTrigger>
              <SelectValue placeholder="Medio de pago" />
            </SelectTrigger>
            <SelectContent>
              {paymentMethods.map((method) => (
                <SelectItem key={method.id} value={String(method.id)}>
                  {method.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || !paymentMethodId || createMutation.isPending}
          >
            Agregar
          </Button>
        </CardContent>
      </Card>

      {query.isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {professors.map((professor) => (
        <Card key={professor.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            {editingId === professor.id ? (
              <div className="grid flex-1 gap-2 md:grid-cols-[1fr_1fr_180px_1fr_auto_auto]">
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nombre" />
                <Input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="Teléfono" />
                <Select value={editPaymentMethodId || undefined} onValueChange={setEditPaymentMethodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Medio de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.id} value={String(method.id)}>
                        {method.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={editAccount}
                  onChange={(event) => setEditAccount(event.target.value)}
                  placeholder="Cuenta, ej. pcp.clases.seba"
                />
                <Button
                  disabled={!editName.trim() || !editPaymentMethodId || updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      id: professor.id,
                      name: editName,
                      phone: editPhone,
                      paymentMethodId: Number(editPaymentMethodId),
                      paymentAccount: editAccount,
                    })
                  }
                >
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setEditingId(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <CardTitle className="text-lg">{professor.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Cuenta: {professor.payment_method?.account || professor.payment_method?.name || "sin cuenta"}
                    {professor.phone ? ` · ${professor.phone}` : ""}
                    {!professor.is_active ? " · inactivo" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingId(professor.id);
                      setEditName(professor.name);
                      setEditPhone(professor.phone ?? "");
                      setEditPaymentMethodId(
                        professor.payment_method_id ? String(professor.payment_method_id) : ""
                      );
                      setEditAccount(professor.payment_method?.account || professor.payment_method?.name || "");
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateMutation.mutate({ id: professor.id, isActive: !professor.is_active })}
                  >
                    {professor.is_active ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {professor.rates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no tiene tarifas.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {professor.rates.map((rate) => (
                  <li key={rate.id} className="flex items-center justify-between gap-3">
                    <span>
                      {rate.weekly_count} {rate.weekly_count === 1 ? "clase" : "clases"} por semana ·{" "}
                      {formatPesos(rate.monthly_amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRateMutation.mutate(rate.id)}
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 md:grid-cols-[120px_160px_auto]">
              <Input
                type="number"
                min={1}
                placeholder="Clases/sem"
                value={rateCount[professor.id] ?? ""}
                onChange={(event) =>
                  setRateCount((current) => ({ ...current, [professor.id]: event.target.value }))
                }
              />
              <Input
                type="number"
                min={0}
                placeholder="Monto del mes"
                value={rateAmount[professor.id] ?? ""}
                onChange={(event) =>
                  setRateAmount((current) => ({ ...current, [professor.id]: event.target.value }))
                }
              />
              <Button
                variant="secondary"
                disabled={rateMutation.isPending}
                onClick={() =>
                  rateMutation.mutate({
                    professorId: professor.id,
                    weeklyCount: Number(rateCount[professor.id]),
                    monthlyAmount: Number(rateAmount[professor.id]),
                  })
                }
              >
                Guardar tarifa
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
