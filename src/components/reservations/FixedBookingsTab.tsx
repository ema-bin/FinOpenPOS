"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerSearchSelect } from "@/components/player-search-select/PlayerSearchSelect";
import { courtReservationsService, playersService } from "@/services";
import { STANDARD_COURT_SLOTS, todayInBuenosAires } from "@/lib/court-reservation-rules";
import { WEEKDAY_LABELS } from "@/lib/class-time";
import { formatTime } from "@/lib/court-slots-utils";
import type { CourtFixedBooking } from "@/repositories/court-reservations.repository";

const emptyForm = {
  id: null as number | null,
  playerId: null as number | null,
  courtId: "",
  weekday: "1",
  slot: "0",
  validFrom: todayInBuenosAires(),
  validUntil: "",
  suspendedFrom: "",
  suspendedUntil: "",
  isActive: true,
};

export function FixedBookingsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [cancelDate, setCancelDate] = useState("");
  const [cancelId, setCancelId] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: ["court-fixed-bookings"],
    queryFn: () => courtReservationsService.fixedBookings(),
  });
  const { data: players = [] } = useQuery({
    queryKey: ["players", "onlyActive"],
    queryFn: () => playersService.getAll("active"),
  });
  const { data: courts = [] } = useQuery({
    queryKey: ["courts", "active"],
    queryFn: async () => {
      const response = await fetch("/api/courts");
      if (!response.ok) throw new Error("No se pudieron cargar las canchas");
      return response.json() as Promise<Array<{ id: number; name: string }>>;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["court-fixed-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["court-reservations"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const slot = STANDARD_COURT_SLOTS[Number(form.slot)];
      if (!form.playerId || !form.courtId || !slot) throw new Error("Completá el turno fijo");
      return courtReservationsService.saveFixed({
        id: form.id,
        player_id: form.playerId,
        court_id: Number(form.courtId),
        weekday: Number(form.weekday),
        start_time: slot.start,
        end_time: slot.end,
        valid_from: form.validFrom,
        valid_until: form.validUntil || null,
        is_active: form.isActive,
        suspended_from: form.suspendedFrom || null,
        suspended_until: form.suspendedUntil || null,
      });
    },
    onSuccess: () => {
      toast.success("Turno fijo guardado.");
      setForm({ ...emptyForm, validFrom: todayInBuenosAires() });
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });
  const deactivate = useMutation({
    mutationFn: (id: number) => courtReservationsService.deactivateFixed(id),
    onSuccess: () => {
      toast.success("Turno fijo desactivado. Las reservas futuras sin cambios quedaron libres.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo desactivar"),
  });
  const cancelOne = useMutation({
    mutationFn: () => courtReservationsService.cancelFixedDate(cancelId!, cancelDate),
    onSuccess: () => {
      toast.success("Esa fecha quedó cancelada.");
      setCancelId(null);
      setCancelDate("");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cancelar la fecha"),
  });

  function edit(booking: CourtFixedBooking) {
    const slotIndex = STANDARD_COURT_SLOTS.findIndex(
      (slot) => slot.start === booking.start_time && slot.end === booking.end_time
    );
    setForm({
      id: booking.id,
      playerId: booking.player_id,
      courtId: String(booking.court_id),
      weekday: String(booking.weekday),
      slot: String(Math.max(slotIndex, 0)),
      validFrom: booking.valid_from,
      validUntil: booking.valid_until ?? "",
      suspendedFrom: booking.suspended_from ?? "",
      suspendedUntil: booking.suspended_until ?? "",
      isActive: booking.is_active,
    });
  }

  return (
    <div className="space-y-6">
      {canWrite ? (
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <PlayerSearchSelect players={players} value={form.playerId} onValueChange={(playerId) => setForm({ ...form, playerId })} />
          <div className="grid gap-3 md:grid-cols-2">
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={form.courtId} onChange={(event) => setForm({ ...form, courtId: event.target.value })} required>
              <option value="">Cancha</option>
              {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={form.weekday} onChange={(event) => setForm({ ...form, weekday: event.target.value })}>
              {WEEKDAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-2 text-sm md:col-span-2" value={form.slot} onChange={(event) => setForm({ ...form, slot: event.target.value })}>
              {STANDARD_COURT_SLOTS.map((slot, index) => (
                <option key={slot.start} value={index}>{formatTime(slot.start)} – {formatTime(slot.end)}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Vigente desde" value={form.validFrom} onChange={(validFrom) => setForm({ ...form, validFrom })} />
            <Field label="Vigente hasta" value={form.validUntil} onChange={(validUntil) => setForm({ ...form, validUntil })} />
            <Field label="Suspender desde" value={form.suspendedFrom} onChange={(suspendedFrom) => setForm({ ...form, suspendedFrom })} />
            <Field label="Suspender hasta" value={form.suspendedUntil} onChange={(suspendedUntil) => setForm({ ...form, suspendedUntil })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            Activo
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>{form.id ? "Guardar cambios" : "Crear turno fijo"}</Button>
            {form.id ? <Button type="button" variant="outline" onClick={() => setForm({ ...emptyForm, validFrom: todayInBuenosAires() })}>Nuevo</Button> : null}
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Podés ver los turnos fijos. Para crearlos o cambiarlos hace falta escritura.</p>
      )}

      {listQuery.isLoading ? (
        <Loader2Icon className="h-5 w-5 animate-spin" />
      ) : (listQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay turnos fijos.</p>
      ) : (
        <div className="space-y-2">
          {(listQuery.data ?? []).map((booking) => (
            <article key={booking.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{booking.player_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.court_name} · {WEEKDAY_LABELS[booking.weekday]} · {formatTime(booking.start_time)}–{formatTime(booking.end_time)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Desde {booking.valid_from.split("-").reverse().join("/")}
                    {booking.valid_until ? ` hasta ${booking.valid_until.split("-").reverse().join("/")}` : ""}
                    {booking.is_active ? "" : " · Inactivo"}
                    {booking.suspended_from ? ` · Suspendido ${booking.suspended_from.split("-").reverse().join("/")} a ${booking.suspended_until?.split("-").reverse().join("/")}` : ""}
                  </p>
                </div>
              </div>
              {canWrite && booking.is_active ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => edit(booking)}>Editar</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => deactivate.mutate(booking.id)}>Desactivar</Button>
                  <Input type="date" value={cancelId === booking.id ? cancelDate : ""} onChange={(event) => { setCancelId(booking.id); setCancelDate(event.target.value); }} className="w-40" />
                  <Button type="button" size="sm" variant="outline" disabled={cancelId !== booking.id || !cancelDate || cancelOne.isPending} onClick={() => cancelOne.mutate()}>
                    Cancelar fecha
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
