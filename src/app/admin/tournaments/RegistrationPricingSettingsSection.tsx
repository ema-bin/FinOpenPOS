"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";

export function RegistrationPricingSettingsSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["club-settings"],
    queryFn: async () => {
      const response = await fetch("/api/club");
      if (!response.ok) throw new Error("No se pudo cargar");
      return response.json() as Promise<{ registration_discount_percent: number }>;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 flex justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo cargar el descuento de inscripción.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <h3 className="text-sm font-semibold">Descuento por categoría inferior</h3>
      <p className="text-sm">{data.registration_discount_percent}%</p>
      <p className="text-xs text-muted-foreground">
        En un torneo puntuable de una categoría, quien juega en una categoría más baja paga la cuota menos este porcentaje. Se cambia en Configuración.
      </p>
    </div>
  );
}
