"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WEEKDAY_LABELS } from "@/lib/class-time";
import { jsonInit, signageApi } from "@/components/signage/api";
import type { SignageConflict, SignagePlaylist, SignageSchedule, SignageScreen } from "@/components/signage/types";

const EMPTY = {
  name: "",
  screen_id: "",
  playlist_id: "",
  weekdays: [1, 2, 3, 4, 5] as number[],
  start_time: "12:00",
  end_time: "18:00",
  starts_on: "",
  ends_on: "",
  priority: "0",
  is_active: true,
};

function fail(error: unknown) {
  toast.error(error instanceof Error ? error.message : "No se pudo guardar");
}

export function ScheduleTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const schedules = useQuery({
    queryKey: ["signage-schedules"],
    queryFn: () => signageApi<{ schedules: SignageSchedule[]; conflicts: SignageConflict[] }>("/api/signage/schedules"),
  });
  const screens = useQuery({ queryKey: ["signage-screens"], queryFn: () => signageApi<SignageScreen[]>("/api/signage/screens") });
  const lists = useQuery({ queryKey: ["signage-playlists"], queryFn: () => signageApi<SignagePlaylist[]>("/api/signage/playlists") });

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, starts_on: form.starts_on || null, ends_on: form.ends_on || null, priority: Number(form.priority) };
      return editingId
        ? signageApi(`/api/signage/schedules/${editingId}`, jsonInit("PATCH", body))
        : signageApi("/api/signage/schedules", jsonInit("POST", body));
    },
    onSuccess: async () => {
      toast.success(editingId ? "Programación actualizada" : "Programación creada");
      setEditingId(null);
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["signage-schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["signage-screens"] });
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: number) => signageApi(`/api/signage/schedules/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Programación eliminada");
      await queryClient.invalidateQueries({ queryKey: ["signage-schedules"] });
    },
    onError: fail,
  });

  const rows = schedules.data?.schedules ?? [];
  const conflicts = schedules.data?.conflicts ?? [];

  function edit(row: SignageSchedule) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      screen_id: String(row.screenId),
      playlist_id: String(row.playlistId),
      weekdays: row.weekdays,
      start_time: row.startTime,
      end_time: row.endTime,
      starts_on: row.startsOn ?? "",
      ends_on: row.endsOn ?? "",
      priority: String(row.priority),
      is_active: row.isActive,
    });
  }

  return (
    <div className="grid gap-6">
      {conflicts.map((conflict) => (
        <p key={`${conflict.leftId}-${conflict.rightId}`} className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {conflict.leftName} y {conflict.rightName} se superponen. Gana la de mayor prioridad y, si empatan, la más antigua.
        </p>
      ))}
      <form className="grid gap-3 rounded-lg border p-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-name">Nombre</Label>
            <Input id="schedule-name" value={form.name} disabled={!canWrite} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-priority">Prioridad</Label>
            <Input id="schedule-priority" inputMode="numeric" value={form.priority} disabled={!canWrite} onChange={(event) => setForm({ ...form, priority: event.target.value })} />
          </div>
          <label className="grid gap-1.5 text-sm">
            Pantalla
            <select className="h-9 rounded-md border bg-background px-2" value={form.screen_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, screen_id: event.target.value })}>
              <option value="">Elegí una pantalla</option>
              {(screens.data ?? []).map((screen) => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            Lista
            <select className="h-9 rounded-md border bg-background px-2" value={form.playlist_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, playlist_id: event.target.value })}>
              <option value="">Elegí una lista</option>
              {(lists.data ?? []).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-start">Desde las</Label>
            <Input id="schedule-start" type="time" value={form.start_time} disabled={!canWrite} onChange={(event) => setForm({ ...form, start_time: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-end">Hasta las</Label>
            <Input id="schedule-end" type="time" value={form.end_time} disabled={!canWrite} onChange={(event) => setForm({ ...form, end_time: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-from">Vigencia desde</Label>
            <Input id="schedule-from" type="date" value={form.starts_on} disabled={!canWrite} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-to">Vigencia hasta</Label>
            <Input id="schedule-to" type="date" value={form.ends_on} disabled={!canWrite} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, day) => {
            const selected = form.weekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                disabled={!canWrite}
                className={`rounded-md border px-2 py-1 text-sm ${selected ? "border-primary bg-primary text-primary-foreground" : ""}`}
                onClick={() => setForm({
                  ...form,
                  weekdays: selected ? form.weekdays.filter((value) => value !== day) : [...form.weekdays, day],
                })}
              >
                {label.slice(0, 3)}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">Si la hora de fin es anterior a la de inicio, la franja cruza la medianoche. Si son iguales, dura todo el día.</p>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.is_active} disabled={!canWrite} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
          Activa
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={!canWrite || save.isPending}>{editingId ? "Guardar" : "Crear"}</Button>
          {editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancelar</Button> : null}
        </div>
      </form>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border p-3">
            <p className="font-medium">{row.name}</p>
            <p className="text-sm text-muted-foreground">{row.startTime}–{row.endTime} · prioridad {row.priority}</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => edit(row)}>Editar</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(row.id)}>Eliminar</Button>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr><th className="py-2">Nombre</th><th>Horario</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="py-2">{row.name}</td>
                <td>{row.startTime}–{row.endTime}</td>
                <td>{row.priority}</td>
                <td>{row.isActive ? "Activa" : "Pausada"}</td>
                <td className="space-x-2 text-right">
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(row)}>Editar</Button>
                  <Button type="button" size="sm" variant="outline" disabled={!canWrite} onClick={() => remove.mutate(row.id)}>Eliminar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
