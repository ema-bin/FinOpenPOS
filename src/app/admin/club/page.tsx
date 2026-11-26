"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/components/permissions-provider";
import { WEEKDAY_LABELS } from "@/lib/class-time";
import { hexToHsl, hslToHex } from "@/lib/clubs/color";
import { DAILY_JOB_HOUR } from "@/lib/clubs/schedule";
import type { ClubSettings } from "@/lib/clubs/settings";
import type { TournamentRankingPointRule } from "@/models/db/tournament-ranking-point-rule";
import { cn } from "@/lib/utils";
import { ClubPaymentLists } from "@/components/club/ClubPaymentLists";
import { MercadoPagoCredentials } from "@/components/club/MercadoPagoCredentials";
import { TimezoneSelect } from "@/components/club/TimezoneSelect";

const ROUND_LABELS: Record<string, string> = {
  champion: "Campeón",
  final: "Final",
  semifinal: "Semifinal",
  cuartos: "Cuartos",
  octavos: "Octavos",
  "16avos": "16avos",
  groups: "Grupos (no clasifica)",
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const TABS = [
  { id: "ficha", label: "Ficha" },
  { id: "canchas", label: "Canchas" },
  { id: "clases", label: "Clases" },
  { id: "torneos", label: "Torneos" },
  { id: "ventas", label: "Ventas" },
  { id: "pagos", label: "Medios de pago" },
] as const;

async function fetchClub(): Promise<ClubSettings> {
  const response = await fetch("/api/club");
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar el complejo");
  return data;
}

function ModuleSection({
  title,
  description,
  active,
  onActiveChange,
  canWrite,
  children,
}: {
  title: string;
  description?: string;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  canWrite: boolean;
  children?: ReactNode;
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
          <Switch
            checked={active}
            disabled={!canWrite}
            onCheckedChange={onActiveChange}
            aria-label={`${title} activo`}
          />
        </div>
      </CardHeader>
      {children ? (
        <CardContent className={cn(!active && "pointer-events-none opacity-40")}>{children}</CardContent>
      ) : null}
    </Card>
  );
}

function ColorField({
  label,
  hsl,
  onChange,
  disabled,
}: {
  label: string;
  hsl: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const hex = hslToHex(hsl) ?? "#000000";
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="color"
        value={hex}
        disabled={disabled}
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

export default function ClubSettingsPage() {
  const queryClient = useQueryClient();
  const { can, loading: permsLoading } = usePermissions();
  const canWrite = !permsLoading && can("users.manage");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["club-settings"],
    queryFn: fetchClub,
  });
  const [draft, setDraft] = useState<ClubSettings | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("ficha");
  const { data: pointRules, error: pointsError } = useQuery<TournamentRankingPointRule[]>({
    queryKey: ["ranking-point-rules"],
    queryFn: async () => {
      const response = await fetch("/api/ranking-point-rules");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudieron leer los puntos");
      return body;
    },
  });
  const [pointDraft, setPointDraft] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  useEffect(() => {
    if (!pointRules) return;
    const next: Record<string, string> = {};
    for (const rule of pointRules) next[rule.round_reached] = String(rule.points);
    setPointDraft(next);
  }, [pointRules]);

  const save = useMutation({
    mutationFn: async (value: {
      settings: ClubSettings;
      points: Record<string, string> | null;
      rules: TournamentRankingPointRule[] | null;
    }) => {
      const response = await fetch("/api/club", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value.settings),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo guardar");
      if (value.rules && value.points) {
        const pointsResponse = await fetch("/api/ranking-point-rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            value.rules.map((rule) => ({
              round_reached: rule.round_reached,
              points: Number(value.points?.[rule.round_reached]),
            }))
          ),
        });
        const pointsBody = await pointsResponse.json().catch(() => null);
        if (!pointsResponse.ok) {
          throw new Error(pointsBody?.error ?? "La ficha se guardó, pero no los puntos del ranking");
        }
      }
      return body as ClubSettings;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["club-settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["club-brand"] });
      queryClient.invalidateQueries({ queryKey: ["ranking-point-rules"] });
      toast.success("Configuración guardada.");
    },
    onError: (saveError) => toast.error(saveError instanceof Error ? saveError.message : "No se pudo guardar"),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/club/logo", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo subir el logo");
      return String(body.url);
    },
    onSuccess: (url) => setDraft((current) => (current ? { ...current, logo_url: url } : current)),
    onError: (uploadError) => toast.error(uploadError instanceof Error ? uploadError.message : "No se pudo subir el logo"),
  });

  if (isLoading || !draft) {
    return (
      <div className="flex justify-center py-16">
        {isError ? (
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo cargar"}</p>
        ) : (
          <Loader2Icon className="h-5 w-5 animate-spin" />
        )}
      </div>
    );
  }

  const set = <K extends keyof ClubSettings>(key: K, value: ClubSettings[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Al guardar se aplican el logo, los colores, el horario, los turnos fijos, las clases, los torneos y las ventas. Los medios de pago se guardan en su pestaña.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md border px-3 py-2 text-left text-sm ${
              tab === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "ficha" ? (
      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>Nombre, logo y zona horaria del complejo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="club-name">Nombre</Label>
              <Input id="club-name" value={draft.name} disabled={!canWrite} onChange={(event) => set("name", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-short">Nombre corto</Label>
              <Input id="club-short" value={draft.short_name} disabled={!canWrite} onChange={(event) => set("short_name", event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="club-tz">Zona horaria</Label>
              <TimezoneSelect
                id="club-tz"
                value={draft.timezone}
                disabled={!canWrite}
                onChange={(value) => set("timezone", value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {draft.logo_url ? (
              <img src={draft.logo_url} alt="" className="h-12 w-12 rounded object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded border text-xs text-muted-foreground">Logo</div>
            )}
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={!canWrite || upload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField label="Principal" hsl={draft.primary_color} disabled={!canWrite} onChange={(value) => set("primary_color", value)} />
            <ColorField label="Acento" hsl={draft.accent_color} disabled={!canWrite} onChange={(value) => set("accent_color", value)} />
            <ColorField label="Texto sobre principal" hsl={draft.on_primary_color} disabled={!canWrite} onChange={(value) => set("on_primary_color", value)} />
          </div>
        </CardContent>
      </Card>
      ) : null}

      {tab === "canchas" ? (
      <>
      <Card>
        <CardHeader>
          <CardTitle>Horario de canchas</CardTitle>
          <CardDescription>Los turnos que se generen después de guardar usan este horario. Los días que ya tienen turnos no se rehacen.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="club-open">Apertura</Label>
            <Input id="club-open" type="time" value={draft.open_time} disabled={!canWrite} onChange={(event) => set("open_time", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-close">Cierre</Label>
            <Input id="club-close" type="time" value={draft.close_time} disabled={!canWrite} onChange={(event) => set("close_time", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-duration">Duración del turno (minutos)</Label>
            <Input
              id="club-duration"
              type="number"
              min={15}
              max={240}
              value={draft.slot_duration_minutes}
              disabled={!canWrite}
              onChange={(event) => set("slot_duration_minutes", Number(event.target.value))}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm sm:col-span-2">
            Turno que cruza medianoche
            <Switch checked={draft.overnight_slot} disabled={!canWrite} onCheckedChange={(checked) => set("overnight_slot", checked)} />
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Índice de ocupación</CardTitle>
          <CardDescription>
            Horario en el que se mide cuánto se usan las canchas. Entran los turnos, las clases y los torneos. No cambia la grilla de turnos. Si el fin es anterior al inicio, el horario cruza la medianoche.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="occupancy-start">Desde</Label>
            <Input
              id="occupancy-start"
              type="time"
              value={draft.occupancy_start_time}
              disabled={!canWrite}
              onChange={(event) => set("occupancy_start_time", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occupancy-end">Hasta</Label>
            <Input
              id="occupancy-end"
              type="time"
              value={draft.occupancy_end_time}
              disabled={!canWrite}
              onChange={(event) => set("occupancy_end_time", event.target.value)}
            />
          </div>
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
                  checked={draft.fixed_weekdays.includes(weekday)}
                  disabled={!canWrite}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...draft.fixed_weekdays, weekday]
                      : draft.fixed_weekdays.filter((day) => day !== weekday);
                    set("fixed_weekdays", next.sort((a, b) => a - b));
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <ModuleSection
        title="Reservas"
        description="Cada semana arma los turnos de la semana siguiente con los horarios fijos. Corre los sábados a las 06:00, dentro de la tarea que baja las liquidaciones."
        active={draft.module_reservations}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_reservations", checked)}
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            Generar la semana siguiente
            <Switch
              checked={draft.auto_reservation_week}
              disabled={!canWrite || !draft.module_reservations}
              onCheckedChange={(checked) => set("auto_reservation_week", checked)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="club-week-day">Día</Label>
              <select
                id="club-week-day"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={draft.reservation_week_weekday}
                disabled={!canWrite || !draft.module_reservations}
                onChange={(event) => set("reservation_week_weekday", Number(event.target.value))}
              >
                {WEEKDAY_LABELS.map((label, weekday) => (
                  <option key={label} value={weekday}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-week-hour">Hora</Label>
              <select
                id="club-week-hour"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={draft.reservation_week_hour}
                disabled={!canWrite || !draft.module_reservations}
                onChange={(event) => set("reservation_week_hour", Number(event.target.value))}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </ModuleSection>

      <ModuleSection
        title="Packs"
        description="Packs de turnos de cancha."
        active={draft.module_packs}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_packs", checked)}
      />
      </>
      ) : null}

      {tab === "clases" ? (
      <ModuleSection
        title="Clases"
        active={draft.module_classes}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_classes", checked)}
      >
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="club-class-limit">Cupo de alumnos</Label>
          <Input
            id="club-class-limit"
            type="number"
            min={1}
            max={30}
            value={draft.class_player_limit}
            disabled={!canWrite || !draft.module_classes}
            onChange={(event) => set("class_player_limit", Number(event.target.value))}
          />
        </div>
      </ModuleSection>
      ) : null}

      {tab === "torneos" ? (
      <ModuleSection
        title="Torneos"
        description="Descuento para el jugador que se anota en una categoría superior a la suya."
        active={draft.module_tournaments}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_tournaments", checked)}
      >
        <div className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="club-discount">Descuento por categoría superior (%)</Label>
            <Input
              id="club-discount"
              type="number"
              min={0}
              max={100}
              value={draft.registration_discount_percent}
              disabled={!canWrite || !draft.module_tournaments}
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
            {pointsError ? (
              <p className="text-sm text-destructive">
                {pointsError instanceof Error ? pointsError.message : "No se pudieron leer los puntos"}
              </p>
            ) : pointDraft && pointRules ? (
              pointRules.map((rule) => (
                <label key={rule.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{ROUND_LABELS[rule.round_reached] ?? rule.round_reached}</span>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-24 text-right"
                    value={pointDraft[rule.round_reached] ?? ""}
                    disabled={!canWrite || !draft.module_tournaments}
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
      </ModuleSection>
      ) : null}

      {tab === "ventas" ? (
      <ModuleSection
        title="Ventas"
        description="A las 03:00 se pide a Mercado Pago el reporte de ayer y de hoy. A las 06:00 se baja ese archivo, se guardan las filas y se hace el cierre de caja. Esas horas son las mismas para todos los complejos."
        active={draft.module_buffet}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_buffet", checked)}
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            Cierre de caja diario
            <Switch
              checked={draft.auto_daily_closure}
              disabled={!canWrite || !draft.module_buffet}
              onCheckedChange={(checked) => set("auto_daily_closure", checked)}
            />
          </label>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="club-closure-hour">Hora del cierre</Label>
            <select
              id="club-closure-hour"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={DAILY_JOB_HOUR}
              disabled
            >
              <option value={DAILY_JOB_HOUR}>06:00</option>
            </select>
          </div>
        </div>
      </ModuleSection>
      ) : null}

      {tab === "pagos" ? (
      <>
      <Card>
        <CardHeader>
          <CardTitle>Medios de pago</CardTitle>
          <CardDescription>
            Canchas, cantina, clases y torneos tienen cada uno su lista. Un medio que hoy sirve para canchas y cantina aparece en las dos. En canchas, Mercado Pago marca el medio que usa el access token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClubPaymentLists canWrite={canWrite} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mercado Pago</CardTitle>
          <CardDescription>
            Access token de cada medio de canchas marcado como Mercado Pago. A las 03:00 se pide el reporte y a las 06:00 se baja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MercadoPagoCredentials timeZone={draft.timezone} />
        </CardContent>
      </Card>
      </>
      ) : null}

      {canWrite ? (
        <Button
          type="button"
          onClick={() => save.mutate({ settings: draft, points: pointDraft, rules: pointRules ?? null })}
          disabled={save.isPending}
        >
          {save.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      ) : null}
    </div>
  );
}
