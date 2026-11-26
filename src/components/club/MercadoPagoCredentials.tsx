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
import { settlementRequestWindow } from "@/lib/finance/settlement-window";

const DEFAULT_TIME_ZONE = "America/Argentina/Buenos_Aires";

type Payload = { methods: PaymentCredentialStatus[] };

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? fallback);
  return body;
}

export function MercadoPagoCredentials({ timeZone = DEFAULT_TIME_ZONE }: { timeZone?: string }) {
  const queryClient = useQueryClient();
  const { can, loading } = usePermissions();
  const canWrite = !loading && can("users.manage");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [removing, setRemoving] = useState<PaymentCredentialStatus | null>(null);
  const [generating, setGenerating] = useState<PaymentCredentialStatus | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [notice, setNotice] = useState<string | null>(null);

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

  const generate = useMutation({
    mutationFn: async ({ paymentMethodId, from, to }: { paymentMethodId: number; from: string; to: string }) => {
      const response = await fetch("/api/court-balance/settlement-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId, from, to }),
      });
      return readJson(response, "No se pudo pedir el reporte.") as Promise<{
        from: string;
        to: string;
        status: string | null;
      }>;
    },
    onSuccess: (result) => {
      setGenerating(null);
      const from = result.from.slice(8, 10) + "/" + result.from.slice(5, 7);
      const to = result.to.slice(8, 10) + "/" + result.to.slice(5, 7);
      setNotice(`Pedido el reporte del ${from} al ${to}. Mercado Pago lo está armando. Cuando tenga archivo, Traer liquidaciones lo guarda.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo pedir el reporte."),
  });

  const bring = useMutation({
    mutationFn: async (paymentMethodId: number) => {
      const response = await fetch("/api/court-balance/settlement-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId }),
      });
      return readJson(response, "No se pudieron traer las liquidaciones.") as Promise<{
        importedFiles: number;
        insertedRows: number;
        skippedRows: number;
        skippedFiles?: number;
      }>;
    },
    onSuccess: (result) => {
      const skippedFile = result.skippedFiles
        ? " Un archivo de Mercado Pago no es CSV y no se guarda."
        : "";
      if (result.importedFiles === 0) {
        setNotice(`No hay liquidaciones nuevas.${skippedFile}`);
        return;
      }
      setNotice(
        `Se guardaron ${result.insertedRows} fila(s) de ${result.importedFiles} reporte(s). ${result.skippedRows} ya estaban.${skippedFile}`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudieron traer las liquidaciones."),
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
      <p className="text-sm text-muted-foreground">
        El access token queda cifrado y esta pantalla no lo vuelve a mostrar. A las 03:00 se pide el reporte de ayer y de hoy. A las 06:00 se baja ese archivo y se guardan las filas. Generar reporte deja cambiar ese rango, hasta 60 días.
      </p>

      {credentials.isLoading && <p className="text-sm text-muted-foreground">Cargando medios…</p>}
      {credentials.isError && (
        <p className="text-sm text-destructive">
          {credentials.error instanceof Error ? credentials.error.message : "No se pudieron cargar los medios."}
        </p>
      )}

      {methods.length === 0 && credentials.isSuccess && (
        <p className="text-sm text-muted-foreground">Ningún medio de canchas está marcado como Mercado Pago.</p>
      )}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

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
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generate.isPending}
                    onClick={() => {
                      const range = settlementRequestWindow(new Date(), timeZone);
                      setFromDate(range.from);
                      setToDate(range.to);
                      setGenerating(method);
                    }}
                  >
                    Generar reporte
                  </Button>
                ) : null}
                {method.configured ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={bring.isPending}
                    onClick={() => bring.mutate(method.id)}
                  >
                    Traer liquidaciones
                  </Button>
                ) : null}
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

      <Dialog open={generating != null} onOpenChange={(open) => { if (!open) setGenerating(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar reporte</DialogTitle>
            <DialogDescription>
              {generating ? `${generating.name}. Mercado Pago arma días enteros, de 00:00 a 23:59.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              Desde
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              Hasta
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGenerating(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={generate.isPending || !fromDate || !toDate || generating == null}
              onClick={() => {
                if (generating) generate.mutate({ paymentMethodId: generating.id, from: fromDate, to: toDate });
              }}
            >
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
