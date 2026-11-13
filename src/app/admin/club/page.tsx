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
import type { ClubSettings } from "@/lib/clubs/settings";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

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

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (value: ClubSettings) => {
      const response = await fetch("/api/club", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo guardar");
      return body as ClubSettings;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["club-settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["club-brand"] });
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
          El logo y los colores se aplican al guardar. El horario, los módulos y el resto quedan guardados y todavía no cambian turnos, clases ni los procesos automáticos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>Nombre y logo que se ven en el panel.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Horario de canchas</CardTitle>
          <CardDescription>La grilla de turnos sigue usando 10:00 a 01:00 hasta la fase en que lea esta ficha.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="club-tz">Zona horaria</Label>
            <Input id="club-tz" value={draft.timezone} disabled={!canWrite} onChange={(event) => set("timezone", event.target.value)} />
          </div>
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
        description="La hora es la del complejo. El cron de la plataforma sigue en su horario actual."
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

      <ModuleSection
        title="Torneos"
        description="En un torneo puntuable de una categoría, quien juega en una categoría más baja paga la cuota menos este porcentaje."
        active={draft.module_tournaments}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_tournaments", checked)}
      >
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="club-discount">Descuento por categoría inferior (%)</Label>
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
      </ModuleSection>

      <ModuleSection
        title="Packs"
        active={draft.module_packs}
        canWrite={canWrite}
        onActiveChange={(checked) => set("module_packs", checked)}
      />

      <ModuleSection
        title="Ventas"
        description="La hora del cierre es la del complejo. El cron de la plataforma sigue en su horario actual."
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
              value={draft.daily_closure_hour}
              disabled={!canWrite || !draft.module_buffet}
              onChange={(event) => set("daily_closure_hour", Number(event.target.value))}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
        </div>
      </ModuleSection>

      {canWrite ? (
        <Button type="button" onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      ) : null}
    </div>
  );
}
