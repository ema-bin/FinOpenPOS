"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/components/permissions-provider";
import type { PaymentCredentialStatus } from "@/lib/finance/payment-credentials";

type Payload = { methods: PaymentCredentialStatus[] };

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? fallback);
  return body;
}

export function MercadoPagoCredentials() {
  const queryClient = useQueryClient();
  const { can, loading } = usePermissions();
  const canWrite = !loading && can("finance.manage");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [removing, setRemoving] = useState<PaymentCredentialStatus | null>(null);

  const credentials = useQuery({
    queryKey: ["court-payment-credentials"],
    queryFn: async () => {
      const response = await fetch("/api/court-balance/payment-credentials", { cache: "no-store" });
      return readJson(response, "No se pudieron cargar los medios.") as Promise<Payload>;
    },
  });

  const save = useMutation({
    mutationFn: async ({ paymentMethodId, accessToken }: { paymentMethodId: number; accessToken: string }) => {
      const response = await fetch("/api/court-balance/payment-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId, accessToken }),
      });
      await readJson(response, "No se pudo guardar el token.");
      return paymentMethodId;
    },
    onSuccess: async (paymentMethodId) => {
      setDrafts((current) => ({ ...current, [paymentMethodId]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["court-payment-credentials"] });
      toast.success("Token guardado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar el token."),
  });

  const remove = useMutation({
    mutationFn: async (paymentMethodId: number) => {
      const response = await fetch(
        `/api/court-balance/payment-credentials?paymentMethodId=${paymentMethodId}`,
        { method: "DELETE" },
      );
      await readJson(response, "No se pudo quitar el token.");
    },
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["court-payment-credentials"] });
      toast.success("Token quitado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo quitar el token."),
  });

  const methods = credentials.data?.methods ?? [];

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Mercado Pago</h2>
        <p className="text-sm text-muted-foreground">
          Aparecen los medios de canchas marcados como Mercado Pago en Configuración. El access token queda cifrado y esta pantalla no lo vuelve a mostrar.
        </p>
      </div>

      {credentials.isLoading && <p className="text-sm text-muted-foreground">Cargando medios…</p>}
      {credentials.isError && (
        <p className="text-sm text-destructive">
          {credentials.error instanceof Error ? credentials.error.message : "No se pudieron cargar los medios."}
        </p>
      )}

      {methods.length === 0 && credentials.isSuccess && (
        <p className="text-sm text-muted-foreground">Ningún medio de canchas está marcado como Mercado Pago.</p>
      )}

      <div className="space-y-2">
        {methods.map((method) => (
          <form
            key={method.id}
            className="rounded-lg border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const accessToken = (drafts[method.id] ?? "").trim();
              if (accessToken) save.mutate({ paymentMethodId: method.id, accessToken });
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{method.name}</p>
              <p className="text-xs text-muted-foreground">{method.configured ? "Conectado" : "Sin token"}</p>
            </div>
            {canWrite ? (
              <div className="mt-2 flex flex-col gap-2 md:flex-row">
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Access token"
                  value={drafts[method.id] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [method.id]: event.target.value }))}
                />
                <Button type="submit" disabled={save.isPending || !(drafts[method.id] ?? "").trim()}>
                  Guardar
                </Button>
                {method.configured ? (
                  <Button type="button" variant="outline" onClick={() => setRemoving(method)}>
                    Quitar
                  </Button>
                ) : null}
              </div>
            ) : null}
          </form>
        ))}
      </div>

      <Dialog open={removing != null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar token</DialogTitle>
            <DialogDescription>
              {removing ? `${removing.name} deja de tener access token. Para volver a conectarlo hay que pegarlo de nuevo.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || removing == null}
              onClick={() => { if (removing) remove.mutate(removing.id); }}
            >
              Quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
