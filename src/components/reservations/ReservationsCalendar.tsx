"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayerSearchSelect } from "@/components/player-search-select/PlayerSearchSelect";
import { courtReservationsService, courtSlotsService, playersService } from "@/services";
import { nextMonday, todayInBuenosAires } from "@/lib/court-reservation-rules";
import type { ReservationSlotView as SlotView } from "@/services/court-reservations.service";
import { formatTime } from "@/lib/court-slots-utils";

function tone(slot: SlotView) {
  if (slot.tournament_block) return "border-amber-300 bg-amber-50 dark:bg-amber-950/30";
  if (slot.class_block) return "border-sky-300 bg-sky-50 dark:bg-sky-950/30";
  if (slot.reservation_status === "reserved" && slot.reservation_source === "fixed") {
    return "border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30";
  }
  if (slot.reservation_status === "reserved") return "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30";
  return "border-border bg-background";
}

function statusLabel(slot: SlotView) {
  if (slot.tournament_block) return `Torneo · ${slot.tournament_block.label}`;
  if (slot.class_block) return `Clase · ${slot.class_block.label}`;
  if (slot.reservation_status === "reserved") {
    const origin = slot.reservation_source === "fixed" ? "Turno fijo" : "Reserva";
    return `${origin} · ${slot.reserved_player_name ?? "Sin nombre"}`;
  }
  return "Libre";
}

export function ReservationsCalendar({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => todayInBuenosAires());
  const [courtId, setCourtId] = useState<number | "all">("all");
  const [selected, setSelected] = useState<SlotView | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);

  const dayQuery = useQuery({
    queryKey: ["court-reservations", date],
    queryFn: () => courtReservationsService.day(date),
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

  const slots = useMemo(() => {
    const rows = dayQuery.data ?? [];
    return courtId === "all" ? rows : rows.filter((slot) => slot.court_id === courtId);
  }, [courtId, dayQuery.data]);
  const times = useMemo(
    () => Array.from(new Set(slots.map((slot) => slot.start_time))),
    [slots]
  );
  const visibleCourts = useMemo(() => {
    const ids = Array.from(new Set(slots.map((slot) => slot.court_id)));
    return ids.map((id) => ({
      id,
      name: slots.find((slot) => slot.court_id === id)?.court_name ?? "Cancha",
    }));
  }, [slots]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["court-reservations", date] });
  const save = useMutation({
    mutationFn: async () => {
      if (!selected || playerId == null) throw new Error("Elegí un jugador");
      if (selected.reservation_status === "reserved") {
        await courtReservationsService.setPlayer(selected.id, playerId);
      } else {
        await courtReservationsService.reserve(selected.id, playerId);
      }
    },
    onSuccess: () => {
      toast.success(selected?.reservation_status === "reserved" ? "Reserva actualizada." : "Turno reservado.");
      setSelected(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });
  const cancel = useMutation({
    mutationFn: () => courtReservationsService.cancel(selected!.id),
    onSuccess: () => {
      toast.success("Reserva cancelada.");
      setSelected(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cancelar"),
  });
  const generateDay = useMutation({
    mutationFn: () => courtSlotsService.generate({ date }),
    onSuccess: () => {
      toast.success("Turnos del día listos.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudieron generar los turnos"),
  });
  const generateWeek = useMutation({
    mutationFn: () => courtReservationsService.generateWeek(nextMonday(date)),
    onSuccess: () => toast.success("Semana generada."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo generar la semana"),
  });

  const blocked = Boolean(selected?.class_block || selected?.tournament_block);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="reservation-date" className="text-xs">Fecha</Label>
          <Input id="reservation-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-40 max-md:w-full" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reservation-court" className="text-xs">Cancha</Label>
          <select
            id="reservation-court"
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={courtId === "all" ? "all" : String(courtId)}
            onChange={(event) => setCourtId(event.target.value === "all" ? "all" : Number(event.target.value))}
          >
            <option value="all">Todas</option>
            {courts.map((court) => (
              <option key={court.id} value={court.id}>{court.name}</option>
            ))}
          </select>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => generateDay.mutate()} disabled={generateDay.isPending}>
              Generar este día
            </Button>
            <Button type="button" variant="outline" onClick={() => generateWeek.mutate()} disabled={generateWeek.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(date)}>
              Generar semana del {/^\d{4}-\d{2}-\d{2}$/.test(date) ? nextMonday(date).split("-").reverse().join("/") : "lunes"}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Libre</span>
        <span className="text-emerald-700">Reserva</span>
        <span className="text-indigo-700">Turno fijo</span>
        <span className="text-sky-700">Clase</span>
        <span className="text-amber-700">Torneo</span>
      </div>
      {dayQuery.isLoading ? (
        <div className="flex justify-center py-8"><Loader2Icon className="h-5 w-5 animate-spin" /></div>
      ) : dayQuery.isError ? (
        <p className="text-sm text-destructive">{dayQuery.error instanceof Error ? dayQuery.error.message : "No se pudieron cargar las reservas"}</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este día todavía no tiene turnos generados.</p>
      ) : (
        <div className="space-y-4">
          {times.map((time) => (
            <section key={time} className="space-y-2">
              <h2 className="text-sm font-medium">{formatTime(time)}</h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {visibleCourts.map((court) => {
                  const slot = slots.find((item) => item.start_time === time && item.court_id === court.id);
                  if (!slot) return null;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`rounded-lg border p-3 text-left ${tone(slot)}`}
                      onClick={() => {
                        setSelected(slot);
                        setPlayerId(slot.reserved_player_id);
                      }}
                    >
                      <div className="text-xs text-muted-foreground">{slot.court_name} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}</div>
                      <div className="mt-1 text-sm font-medium">{statusLabel(slot)}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected ? `${selected.court_name} · ${formatTime(selected.start_time)}–${formatTime(selected.end_time)}` : "Turno"}
            </DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <p className="text-sm">{statusLabel(selected)}</p>
              {blocked ? (
                <p className="text-sm text-muted-foreground">Ese horario está ocupado y no se puede reservar.</p>
              ) : canWrite ? (
                <PlayerSearchSelect
                  players={players}
                  value={playerId}
                  onValueChange={setPlayerId}
                  placeholder="Jugador de la reserva"
                />
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {canWrite && selected?.reservation_status === "reserved" && !blocked ? (
              <Button type="button" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancelar reserva
              </Button>
            ) : null}
            {canWrite && !blocked ? (
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || playerId == null}>
                {selected?.reservation_status === "reserved" ? "Cambiar jugador" : "Reservar"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
