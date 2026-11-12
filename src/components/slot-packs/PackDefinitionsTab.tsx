"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { slotCreditsService } from "@/services";
import type { SlotPackDefinition } from "@/repositories/slot-credits.repository";

function money(value: number) {
  return `$${value.toLocaleString("es-AR")}`;
}

const emptyForm = {
  id: null as number | null,
  name: "",
  credits: "",
  price: "",
  isActive: true,
};

export function PackDefinitionsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const { data: definitions = [], isLoading } = useQuery({
    queryKey: ["slot-pack-definitions"],
    queryFn: () => slotCreditsService.listDefinitions(),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      slotCreditsService.saveDefinition({
        id: form.id,
        name: form.name,
        credits: Number(form.credits),
        price: form.price.trim() === "" ? 0 : Number(form.price),
        is_active: form.isActive,
      }),
    onSuccess: () => {
      toast.success(form.id ? "Pack actualizado." : "Pack creado.");
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["slot-pack-definitions"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el pack");
    },
  });

  const edit = (definition: SlotPackDefinition) => {
    setForm({
      id: definition.id,
      name: definition.name,
      credits: String(definition.credits),
      price: String(definition.price),
      isActive: definition.is_active,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estos packs se definen una vez. Vender uno le suma esos turnos al jugador.
        Cambiar los turnos o el precio no modifica las ventas ya hechas.
      </p>
      {canWrite ? (
        <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="definition-name">Nombre</Label>
            <Input
              id="definition-name"
              value={form.name}
              placeholder="Pack 10"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="definition-credits">Turnos</Label>
            <Input
              id="definition-credits"
              inputMode="numeric"
              value={form.credits}
              placeholder="10"
              onChange={(event) => setForm((current) => ({ ...current, credits: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="definition-price">Precio</Label>
            <Input
              id="definition-price"
              inputMode="decimal"
              value={form.price}
              placeholder="0"
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <Checkbox
              checked={form.isActive}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, isActive: Boolean(checked) }))
              }
            />
            Activo para vender
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : form.id ? (
                "Guardar cambios"
              ) : (
                "Crear pack"
              )}
            </Button>
            {form.id ? (
              <Button variant="outline" onClick={() => setForm(emptyForm)} disabled={saveMutation.isPending}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2Icon className="h-5 w-5 animate-spin" />
        </div>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay packs definidos.</p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {definitions.map((definition) => (
              <div key={definition.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{definition.name}</p>
                  <p className="text-sm">{definition.is_active ? "Activo" : "Inactivo"}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {definition.credits} turnos · {money(definition.price)}
                </p>
                {canWrite ? (
                  <Button size="sm" variant="outline" onClick={() => edit(definition)}>
                    Editar
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pack</TableHead>
                  <TableHead>Turnos</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  {canWrite ? <TableHead className="w-24">Acciones</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {definitions.map((definition) => (
                  <TableRow key={definition.id}>
                    <TableCell className="font-medium">{definition.name}</TableCell>
                    <TableCell>{definition.credits}</TableCell>
                    <TableCell>{money(definition.price)}</TableCell>
                    <TableCell>{definition.is_active ? "Activo" : "Inactivo"}</TableCell>
                    {canWrite ? (
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => edit(definition)}>
                          Editar
                        </Button>
                      </TableCell>
                    ) : null}
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
