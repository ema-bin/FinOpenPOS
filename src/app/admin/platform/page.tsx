"use client";

import { useEffect, useState } from "react";
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
import { hexToHsl, hslToHex } from "@/lib/clubs/color";
import { DAILY_JOB_HOUR } from "@/lib/clubs/schedule";
import type { ClubSettings } from "@/lib/clubs/settings";
import type { TournamentRankingPointRule } from "@/models/db/tournament-ranking-point-rule";
import { TimezoneSelect } from "@/components/club/TimezoneSelect";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
  daily_closure_hour: 6,
  auto_reservation_week: true,
  reservation_week_weekday: 6,
  reservation_week_hour: 6,
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const ROUND_LABELS: Record<string, string> = {
  champion: "Campeón",
  final: "Final",
  semifinal: "Semifinal",
  cuartos: "Cuartos",
  octavos: "Octavos",
  "16avos": "16avos",
  groups: "Grupos (no clasifica)",
};

const STEPS = ["Ficha", "Canchas", "Clases", "Torneos", "Ventas", "Medios de pago", "Primer admin"] as const;

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
  const [pointDraft, setPointDraft] = useState<Record<string, string> | null>(null);

  const pointRules = useQuery({
    queryKey: ["ranking-point-rules"],
    enabled: wizard,
    queryFn: async () => {
      const response = await fetch("/api/ranking-point-rules");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudieron leer los puntos");
      return body as TournamentRankingPointRule[];
    },
  });

  useEffect(() => {
    if (!pointRules.data || pointDraft) return;
    const next: Record<string, string> = {};
    for (const rule of pointRules.data) next[rule.round_reached] = String(rule.points);
    setPointDraft(next);
  }, [pointRules.data, pointDraft]);

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
          points: pointRules.data && pointDraft
            ? pointRules.data.map((rule) => ({
                round_reached: rule.round_reached,
                points: Number(pointDraft[rule.round_reached]),
              }))
            : undefined,
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  step === index ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {step === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Identidad</CardTitle>
                <CardDescription>Nombre, colores y zona horaria del complejo. El logo se carga en Configuración, cuando el complejo ya existe.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="alta-name">Nombre</Label>
                    <Input id="alta-name" value={settings.name} onChange={(event) => set("name", event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="alta-short">Nombre corto</Label>
                    <Input id="alta-short" value={settings.short_name} onChange={(event) => set("short_name", event.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="alta-tz">Zona horaria</Label>
                    <TimezoneSelect id="alta-tz" value={settings.timezone} onChange={(value) => set("timezone", value)} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ColorField label="Principal" hsl={settings.primary_color} onChange={(value) => set("primary_color", value)} />
                  <ColorField label="Acento" hsl={settings.accent_color} onChange={(value) => set("accent_color", value)} />
                  <ColorField label="Texto sobre principal" hsl={settings.on_primary_color} onChange={(value) => set("on_primary_color", value)} />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 1 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Canchas</CardTitle>
                  <CardDescription>Una cancha por línea. Los precios se cargan después, dentro del complejo.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea rows={4} value={courts} placeholder={"Cancha 1\nCancha 2"} onChange={(event) => setCourts(event.target.value)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Horario de canchas</CardTitle>
                  <CardDescription>Los turnos que se generen después de guardar usan este horario. Los días que ya tienen turnos no se rehacen.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="alta-open">Apertura</Label>
                    <Input id="alta-open" type="time" value={settings.open_time} onChange={(event) => set("open_time", event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="alta-close">Cierre</Label>
                    <Input id="alta-close" type="time" value={settings.close_time} onChange={(event) => set("close_time", event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="alta-duration">Duración del turno (minutos)</Label>
                    <Input
                      id="alta-duration"
                      type="number"
                      min={15}
                      max={240}
                      value={settings.slot_duration_minutes}
                      onChange={(event) => set("slot_duration_minutes", Number(event.target.value))}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
                    Turno que cruza medianoche
                    <Switch checked={settings.overnight_slot} onCheckedChange={(checked) => set("overnight_slot", checked)} />
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Turnos fijos</CardTitle>
                  <CardDescription>Días en los que se puede dejar un horario para todas las semanas.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
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
                </CardContent>
              </Card>

              <AltaModule
                title="Reservas"
                description="Cada semana arma los turnos de la semana siguiente con los horarios fijos. Elegí el día y la hora. Por ahora solo puede correr los sábados a las 06:00."
                active={settings.module_reservations}
                onActiveChange={(checked) => set("module_reservations", checked)}
              >
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    Generar la semana siguiente
                    <Switch
                      checked={settings.auto_reservation_week}
                      disabled={!settings.module_reservations}
                      onCheckedChange={(checked) => set("auto_reservation_week", checked)}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="alta-week-day">Día</Label>
                      <select
                        id="alta-week-day"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={settings.reservation_week_weekday}
                        disabled={!settings.module_reservations}
                        onChange={(event) => set("reservation_week_weekday", Number(event.target.value))}
                      >
                        {WEEKDAY_LABELS.map((label, weekday) => (
                          <option key={label} value={weekday}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="alta-week-hour">Hora</Label>
                      <select
                        id="alta-week-hour"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={settings.reservation_week_hour}
                        disabled={!settings.module_reservations}
                        onChange={(event) => set("reservation_week_hour", Number(event.target.value))}
                      >
                        {HOURS.map((hour) => (
                          <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </AltaModule>

              <AltaModule
                title="Packs"
                description="Packs de turnos de cancha."
                active={settings.module_packs}
                onActiveChange={(checked) => set("module_packs", checked)}
              />
            </>
          ) : null}

          {step === 2 ? (
            <AltaModule
              title="Clases"
              active={settings.module_classes}
              onActiveChange={(checked) => set("module_classes", checked)}
            >
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="alta-limit">Cupo de alumnos</Label>
                <Input
                  id="alta-limit"
                  type="number"
                  min={1}
                  max={30}
                  value={settings.class_player_limit}
                  disabled={!settings.module_classes}
                  onChange={(event) => set("class_player_limit", Number(event.target.value))}
                />
              </div>
            </AltaModule>
          ) : null}

          {step === 3 ? (
            <AltaModule
              title="Torneos"
              description="Descuento para el jugador que se anota en una categoría superior a la suya."
              active={settings.module_tournaments}
              onActiveChange={(checked) => set("module_tournaments", checked)}
            >
              <div className="space-y-4">
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="alta-discount">Descuento por categoría superior (%)</Label>
                  <Input
                    id="alta-discount"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.registration_discount_percent}
                    disabled={!settings.module_tournaments}
                    onChange={(event) => set("registration_discount_percent", Number(event.target.value))}
                  />
                </div>
                <div className="max-w-md space-y-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Puntos por ronda</p>
                    <p className="text-xs text-muted-foreground">
                      Se aplican al finalizar un torneo puntuable. Los ya cerrados no se recalculan.
                    </p>
                  </div>
                  {pointRules.isError ? (
                    <p className="text-sm text-destructive">
                      {pointRules.error instanceof Error ? pointRules.error.message : "No se pudieron leer los puntos"}
                    </p>
                  ) : pointDraft && pointRules.data ? (
                    pointRules.data.map((rule) => (
                      <label key={rule.id} className="flex items-center justify-between gap-3 text-sm">
                        <span>{ROUND_LABELS[rule.round_reached] ?? rule.round_reached}</span>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-24 text-right"
                          value={pointDraft[rule.round_reached] ?? ""}
                          disabled={!settings.module_tournaments}
                          aria-label={ROUND_LABELS[rule.round_reached] ?? rule.round_reached}
                          onChange={(event) =>
                            setPointDraft((current) =>
                              current ? { ...current, [rule.round_reached]: event.target.value } : current
                            )
                          }
                        />
                      </label>
                    ))
                  ) : (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  )}
                </div>
              </div>
            </AltaModule>
          ) : null}

          {step === 4 ? (
            <AltaModule
              title="Ventas"
              description="Cada día a las 06:00 se hace el cierre de caja y se bajan las liquidaciones de Mercado Pago que falten. Esa hora es la misma para todos los complejos."
              active={settings.module_buffet}
              onActiveChange={(checked) => set("module_buffet", checked)}
            >
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-3 text-sm">
                  Cierre de caja diario
                  <Switch
                    checked={settings.auto_daily_closure}
                    disabled={!settings.module_buffet}
                    onCheckedChange={(checked) => set("auto_daily_closure", checked)}
                  />
                </label>
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="alta-closure-hour">Hora del cierre</Label>
                  <select
                    id="alta-closure-hour"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={DAILY_JOB_HOUR}
                    disabled
                  >
                    <option value={DAILY_JOB_HOUR}>06:00</option>
                  </select>
                </div>
              </div>
            </AltaModule>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Canchas, cantina, clases y torneos tienen cada uno su lista. Un medio que hoy sirve para canchas y cantina aparece en las dos.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ListField label="Canchas" hint="Turnos y packs. Un medio por línea." value={payments.courts} onChange={(value) => setPayments((current) => ({ ...current, courts: value }))} />
                <ListField label="Cantina" hint="Ventas y compras. Un medio por línea." value={payments.buffet} onChange={(value) => setPayments((current) => ({ ...current, buffet: value }))} />
                <ListField label="Clases" hint="Cobros de las clases. Un medio por línea." value={payments.classes} onChange={(value) => setPayments((current) => ({ ...current, classes: value }))} />
                <ListField label="Torneos" hint="Inscripción. Un medio por línea." value={payments.tournaments} onChange={(value) => setPayments((current) => ({ ...current, tournaments: value }))} />
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <Card>
              <CardHeader>
                <CardTitle>Primer admin</CardTitle>
                <CardDescription>La primera persona del complejo. El email no puede existir en otro complejo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
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
              </CardContent>
            </Card>
          ) : null}

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>
              Atrás
            </Button>
            {step < STEPS.length - 1 ? (
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
        </div>
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

function AltaModule({
  title,
  description,
  active,
  onActiveChange,
  children,
}: {
  title: string;
  description?: string;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className={cn("space-y-1.5", !active && "opacity-40")}>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-sm text-muted-foreground">Activo</span>
          <Switch checked={active} onCheckedChange={onActiveChange} aria-label={`${title} activo`} />
        </div>
      </CardHeader>
      {children ? <CardContent className={cn(!active && "pointer-events-none opacity-40")}>{children}</CardContent> : null}
    </Card>
  );
}

function ColorField({ label, hsl, onChange }: { label: string; hsl: string; onChange: (next: string) => void }) {
  const hex = hslToHex(hsl) ?? "#000000";
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="color"
        value={hex}
        aria-label={label}
        className="h-9 w-14 cursor-pointer rounded border bg-transparent p-1"
        onChange={(event) => {
          const next = hexToHsl(event.target.value);
          if (next) onChange(next);
        }}
      />
    </label>
  );
}

function ListField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea rows={4} value={value} placeholder={"Efectivo\nTransferencia"} onChange={(event) => onChange(event.target.value)} />
      </CardContent>
    </Card>
  );
}
