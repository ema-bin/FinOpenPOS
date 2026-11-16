"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WEEKDAY_LABELS } from "@/lib/class-time";
import type { ClubSettings } from "@/lib/clubs/settings";
import { createClient } from "@/lib/supabase/client";

type ClubRow = { id: number; name: string; short_name: string; is_active: boolean };

const EMPTY_SETTINGS: Omit<ClubSettings, "id"> = {
  name: "",
  short_name: "",
  logo_url: null,
  primary_color: "142 60% 35%",
  accent_color: "20 80% 50%",
  on_primary_color: "0 0% 100%",
  timezone: "America/Argentina/Buenos_Aires",
  open_time: "10:00",
  close_time: "01:00",
  slot_duration_minutes: 90,
  overnight_slot: true,
  fixed_weekdays: [1, 2, 3, 4, 5],
  class_player_limit: 5,
  registration_discount_percent: 20,
  module_reservations: true,
  module_classes: true,
  module_tournaments: true,
  module_packs: true,
  module_buffet: true,
  auto_daily_closure: true,
  daily_closure_hour: 3,
  auto_reservation_week: true,
  reservation_week_weekday: 6,
  reservation_week_hour: 3,
};

const MODULES: { key: "module_reservations" | "module_classes" | "module_tournaments" | "module_packs" | "module_buffet"; label: string }[] = [
  { key: "module_reservations", label: "Reservas" },
  { key: "module_classes", label: "Clases" },
  { key: "module_tournaments", label: "Torneos" },
  { key: "module_packs", label: "Packs" },
  { key: "module_buffet", label: "Ventas" },
];

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function enterClub(clubId: number | null) {
  const response = await fetch("/api/platform/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clubId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "No se pudo cambiar de complejo");
  const supabase = createClient();
  const { error } = await supabase.auth.refreshSession();
  if (error) throw new Error(error.message);
  window.location.assign(clubId == null ? "/admin/platform" : "/admin");
}

export default function PlatformPage() {
  const queryClient = useQueryClient();
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [courts, setCourts] = useState("");
  const [payments, setPayments] = useState({ courts: "", buffet: "", classes: "", tournaments: "" });
  const [admin, setAdmin] = useState({ name: "", email: "", password: "" });

  const clubs = useQuery({
    queryKey: ["platform-clubs"],
    queryFn: async () => {
      const response = await fetch("/api/platform/clubs");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudieron cargar los complejos");
      return body as { activeClubId: number | null; clubs: ClubRow[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/platform/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings,
          courts: lines(courts),
          payments: {
            courts: lines(payments.courts),
            buffet: lines(payments.buffet),
            classes: lines(payments.classes),
            tournaments: lines(payments.tournaments),
          },
          admin,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo crear el complejo");
    },
    onSuccess: async () => {
      toast.success("Complejo creado. Entrá para verlo.");
      setWizard(false);
      setStep(0);
      await queryClient.invalidateQueries({ queryKey: ["platform-clubs"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo crear el complejo"),
  });

  const context = useMutation({
    mutationFn: enterClub,
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cambiar de complejo"),
  });

  if (clubs.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2Icon className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (clubs.isError) {
    return <p className="text-sm text-destructive">{clubs.error instanceof Error ? clubs.error.message : "No disponible"}</p>;
  }

  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Complejos</h1>
          <p className="text-sm text-muted-foreground">
            El alta copia los roles y los mensajes de WhatsApp. Las canchas, los jugadores, los precios y los medios de pago empiezan vacíos.
          </p>
        </div>
        <Button type="button" onClick={() => setWizard((open) => !open)}>
          {wizard ? "Cerrar" : "Nuevo complejo"}
        </Button>
      </div>

      {wizard ? (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo complejo</CardTitle>
            <CardDescription>
              {step === 0 && "Ficha. El logo y los colores se ajustan después, dentro del complejo."}
              {step === 1 && "Una cancha por línea."}
              {step === 2 && "Un medio por línea. El mismo nombre puede estar en más de una lista."}
              {step === 3 && "La primera persona del complejo. Tiene que ser un email nuevo."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="alta-name">Nombre</Label>
                  <Input id="alta-name" value={settings.name} onChange={(event) => set("name", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-short">Nombre corto</Label>
                  <Input id="alta-short" value={settings.short_name} onChange={(event) => set("short_name", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-open">Apertura</Label>
                  <Input id="alta-open" type="time" value={settings.open_time} onChange={(event) => set("open_time", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-close">Cierre</Label>
                  <Input id="alta-close" type="time" value={settings.close_time} onChange={(event) => set("close_time", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-duration">Duración del turno (min)</Label>
                  <Input
                    id="alta-duration"
                    type="number"
                    min={15}
                    max={240}
                    value={settings.slot_duration_minutes}
                    onChange={(event) => set("slot_duration_minutes", Number(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-limit">Cupo de la clase</Label>
                  <Input
                    id="alta-limit"
                    type="number"
                    min={1}
                    max={30}
                    value={settings.class_player_limit}
                    onChange={(event) => set("class_player_limit", Number(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-discount">Descuento de inscripción (%)</Label>
                  <Input
                    id="alta-discount"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.registration_discount_percent}
                    onChange={(event) => set("registration_discount_percent", Number(event.target.value))}
                  />
                </div>
                <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
                  Turno que cruza medianoche
                  <Switch checked={settings.overnight_slot} onCheckedChange={(checked) => set("overnight_slot", checked)} />
                </label>
                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  {WEEKDAY_LABELS.map((label, weekday) => (
                    <label key={label} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={settings.fixed_weekdays.includes(weekday)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...settings.fixed_weekdays, weekday]
                            : settings.fixed_weekdays.filter((day) => day !== weekday);
                          set("fixed_weekdays", next.sort((a, b) => a - b));
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  {MODULES.map((module) => (
                    <label key={module.key} className="flex items-center justify-between gap-3 text-sm">
                      {module.label}
                      <Switch
                        checked={Boolean(settings[module.key])}
                        onCheckedChange={(checked) => set(module.key, checked)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <Textarea rows={6} value={courts} placeholder={"Cancha 1\nCancha 2"} onChange={(event) => setCourts(event.target.value)} />
            ) : null}

            {step === 2 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ListField label="Canchas" value={payments.courts} onChange={(value) => setPayments((current) => ({ ...current, courts: value }))} />
                <ListField label="Cantina" value={payments.buffet} onChange={(value) => setPayments((current) => ({ ...current, buffet: value }))} />
                <ListField label="Clases" value={payments.classes} onChange={(value) => setPayments((current) => ({ ...current, classes: value }))} />
                <ListField label="Torneos" value={payments.tournaments} onChange={(value) => setPayments((current) => ({ ...current, tournaments: value }))} />
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="alta-admin-name">Nombre</Label>
                  <Input id="alta-admin-name" value={admin.name} onChange={(event) => setAdmin((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-admin-email">Email</Label>
                  <Input id="alta-admin-email" type="email" value={admin.email} onChange={(event) => setAdmin((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alta-admin-password">Contraseña</Label>
                  <Input id="alta-admin-password" type="password" value={admin.password} onChange={(event) => setAdmin((current) => ({ ...current, password: event.target.value }))} />
                </div>
              </div>
            ) : null}

            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>
                Atrás
              </Button>
              {step < 3 ? (
                <Button type="button" onClick={() => setStep((current) => current + 1)}>
                  Siguiente
                </Button>
              ) : (
                <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Crear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {clubs.data?.clubs.map((club) => {
          const active = clubs.data?.activeClubId === club.id;
          return (
            <Card key={club.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>{club.name}</CardTitle>
                  <CardDescription>{club.short_name}{club.is_active ? "" : " · inactivo"}</CardDescription>
                </div>
                {active ? (
                  <Button type="button" variant="outline" disabled={context.isPending} onClick={() => context.mutate(null)}>
                    Salir
                  </Button>
                ) : (
                  <Button type="button" disabled={!club.is_active || context.isPending} onClick={() => context.mutate(club.id)}>
                    Entrar
                  </Button>
                )}
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ListField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea rows={4} value={value} placeholder={"Efectivo\nTransferencia"} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
