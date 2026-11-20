"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const LISTS = [
  { scope: "COURT", label: "Canchas" },
  { scope: "BAR", label: "Cantina" },
  { scope: "CLASSES", label: "Clases" },
  { scope: "TOURNAMENT", label: "Torneos" },
] as const;

type Method = { id: number; name: string; scope: string; is_active: boolean; is_mercadopago?: boolean };

function acceptsMercadoPago(scope: string) {
  return scope === "COURT" || scope === "BOTH";
}

export function ClubPaymentLists({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const methods = useQuery({
    queryKey: ["club-payment-methods"],
    queryFn: async () => {
      const response = await fetch("/api/club/payment-methods");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudieron cargar los medios");
      return body as Method[];
    },
  });

  const add = useMutation({
    mutationFn: async ({ scope, name }: { scope: string; name: string }) => {
      const response = await fetch("/api/club/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, name }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo agregar");
    },
    onSuccess: async (_data, variables) => {
      setDrafts((current) => ({ ...current, [variables.scope]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["club-payment-methods"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo agregar"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const response = await fetch(`/api/club/payment-methods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo actualizar");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["club-payment-methods"] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo actualizar"),
  });

  const mercadoPago = useMutation({
    mutationFn: async ({ id, is_mercadopago }: { id: number; is_mercadopago: boolean }) => {
      const response = await fetch(`/api/club/payment-methods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_mercadopago }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo actualizar");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["club-payment-methods"] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo actualizar"),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {LISTS.map((list) => {
        const rows = (methods.data ?? []).filter((method) =>
          list.scope === "COURT"
            ? method.scope === "COURT" || method.scope === "BOTH"
            : list.scope === "BAR"
              ? method.scope === "BAR" || method.scope === "BOTH"
              : method.scope === list.scope
        );
        return (
          <div key={list.scope} className="space-y-2">
            <p className="text-sm font-medium">{list.label}</p>
            {rows.map((method) => (
              <div key={method.id} className="space-y-1 text-sm">
                <label className="flex items-center justify-between gap-2">
                  <span className={method.is_active ? "" : "text-muted-foreground"}>{method.name}</span>
                  <Switch
                    checked={method.is_active}
                    disabled={!canWrite || toggle.isPending}
                    onCheckedChange={(checked) => toggle.mutate({ id: method.id, is_active: checked })}
                  />
                </label>
                {list.scope === "COURT" && acceptsMercadoPago(method.scope) ? (
                  <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    Mercado Pago
                    <Switch
                      checked={method.is_mercadopago === true}
                      disabled={!canWrite || mercadoPago.isPending}
                      onCheckedChange={(checked) => mercadoPago.mutate({ id: method.id, is_mercadopago: checked })}
                    />
                  </label>
                ) : null}
              </div>
            ))}
            {canWrite ? (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = (drafts[list.scope] ?? "").trim();
                  if (name) add.mutate({ scope: list.scope, name });
                }}
              >
                <Input
                  value={drafts[list.scope] ?? ""}
                  placeholder="Nuevo medio"
                  onChange={(event) => setDrafts((current) => ({ ...current, [list.scope]: event.target.value }))}
                />
                <Button type="submit" variant="outline" disabled={add.isPending}>
                  Agregar
                </Button>
              </form>
            ) : null}
          </div>
        );
      })}
      {methods.isError ? (
        <p className="text-sm text-destructive sm:col-span-2">
          {methods.error instanceof Error ? methods.error.message : "No se pudieron cargar los medios"}
        </p>
      ) : null}
    </div>
  );
}
