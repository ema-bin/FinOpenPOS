"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

type Settings = { puntuable_lower_category_discount_percent: number };

async function fetchPricingSettings(): Promise<Settings> {
  const res = await fetch("/api/registration-pricing-settings");
  if (!res.ok) throw new Error("No se pudo cargar la configuración");
  return res.json();
}

export function RegistrationPricingSettingsSection() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["registration-pricing-settings"],
    queryFn: fetchPricingSettings,
    staleTime: 60_000,
  });

  const [discountPercent, setDiscountPercent] = useState(20);

  useEffect(() => {
    if (data) setDiscountPercent(data.puntuable_lower_category_discount_percent);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/registration-pricing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puntuable_lower_category_discount_percent: discountPercent,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err?.error === "string" ? err.error : "Error al guardar configuración"
        );
      }
      return res.json() as Promise<Settings>;
    },
    onSuccess: () => {
      toast.success("Configuración de cuotas actualizada");
      queryClient.invalidateQueries({ queryKey: ["registration-pricing-settings"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 flex justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo cargar la configuración global de cuotas. Comprobá la base de datos y la tabla{" "}
        <code className="rounded bg-muted px-1 text-xs">registration_pricing_settings</code>.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Cuotas de inscripción (global)</h3>
        <p className="text-xs text-muted-foreground">
          Aplica a todos los torneos: en torneos puntuables con categoría específica, los jugadores
          con categoría inferior al torneo pagan un porcentaje reducido de la cuota base.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 items-end">
        <div className="space-y-2">
          <Label htmlFor="global-discount-pct">Descuento categoría inferior (%)</Label>
          <Input
            id="global-discount-pct"
            type="number"
            min={0}
            max={100}
            step={1}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            "Guardar configuración"
          )}
        </Button>
      </div>
    </div>
  );
}
