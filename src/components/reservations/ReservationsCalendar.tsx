"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayerSearchSelect } from "@/components/player-search-select/PlayerSearchSelect";
import { courtReservationsService, courtSlotsService, playersService } from "@/services";
import {
  fixedBookingGridDates,
  mondayOfWeek,
  STANDARD_COURT_SLOTS,
  todayInBuenosAires,
  weekDatesFromMonday,
} from "@/lib/court-reservation-rules";
import { addDaysIso, WEEKDAY_LABELS, weekdayOf } from "@/lib/class-time";
import type { ReservationSlotView } from "@/services/court-reservations.service";
import type { CourtFixedBooking } from "@/repositories/court-reservations.repository";
import { formatTime } from "@/lib/court-slots-utils";
import { cn } from "@/lib/utils";

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

const HOUR_COL_PERCENT = 7;
const calendarCell =
  "relative flex h-8 max-h-8 w-full flex-col items-center justify-center overflow-hidden rounded-sm px-0.5 text-[9px] leading-tight transition-colors sm:h-9 sm:max-h-9 sm:rounded-md sm:px-1 sm:text-[10px] md:h-11 md:max-h-11 md:text-[11px]";
const calendarEmptyCell = "h-8 sm:h-9 md:h-11";

type CellTone = "free" | "reserved" | "fixed" | "class" | "tournament" | "missing";

type CourtOption = { id: number; name: string };

type CellTarget = {
  courtId: number;
  courtName: string;
  date: string;
  start: string;
  end: string;
  slot: ReservationSlotView | null;
};

const TONE_CLASS: Record<CellTone, string> = {
  free: "bg-green-600 text-white hover:bg-green-700",
  reserved: "bg-orange-500 text-white hover:bg-orange-600",
  fixed: "bg-red-600 text-white hover:bg-red-700",
  class: "bg-yellow-400 text-yellow-950 hover:bg-yellow-300",
  tournament: "bg-[#b24a32] text-white hover:bg-[#9a3e2a]",
  missing: "bg-green-100 text-green-900 hover:bg-green-200 dark:bg-green-950 dark:text-green-100",
};

const LEGEND: Array<{ tone: CellTone; label: string }> = [
  { tone: "free", label: "Disponible" },
  { tone: "reserved", label: "Reservado" },
  { tone: "fixed", label: "Fijo" },
  { tone: "class", label: "Clase" },
  { tone: "tournament", label: "Torneo" },
];

function clock(value: string): string {
  return value.slice(0, 5);
}

function dayNumber(iso: string): string {
  return iso.slice(8, 10);
}

function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function playerLabel(name: string | null | undefined): string {
  const cleaned = name?.trim();
  if (!cleaned) return "Sin nombre";
  const parts = cleaned.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

function cellTitle(slot: ReservationSlotView | null, start: string, end: string): string {
  const range = `${formatTime(start)}–${formatTime(end)}`;
  if (!slot) return `${range}. Disponible`;
  if (slot.tournament_block) return `${range}. Torneo: ${slot.tournament_block.label}`;
  if (slot.class_block) return `${range}. Clase: ${slot.class_block.label}`;
  if (slot.reservation_status === "reserved") {
    const origin = slot.reservation_source === "fixed" ? "Turno fijo" : "Reserva";
    return `${range}. ${origin}: ${slot.reserved_player_name ?? "Sin nombre"}`;
  }
  return `${range}. Disponible`;
}

function activeFixedBooking(
  courtId: number,
  weekday: number,
  start: string,
  end: string,
  bookings: CourtFixedBooking[]
): CourtFixedBooking | undefined {
  return bookings.find(
    (booking) =>
      booking.is_active &&
      booking.court_id === courtId &&
      booking.weekday === weekday &&
      clock(booking.start_time) === start &&
      clock(booking.end_time) === end
  );
}

function calendarTone(slot: ReservationSlotView | null, _booking?: CourtFixedBooking | undefined): CellTone {
  if (slot?.tournament_block) return "tournament";
  if (slot?.class_block) return "class";
  if (slot?.reservation_status === "reserved" && slot.reservation_source !== "fixed") return "reserved";
  if (slot?.reservation_source === "fixed") return "fixed";
  return "free";
}

export function ReservationsCalendar({
  canWrite,
  mode = "calendar",
}: {
  canWrite: boolean;
  mode?: "calendar" | "fixed";
}) {
  const queryClient = useQueryClient();
  const today = todayInBuenosAires();
  const [monday, setMonday] = useState(() => mondayOfWeek(today));
  const [courtId, setCourtId] = useState<number | null>(null);
  const [target, setTarget] = useState<CellTarget | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);

  const dates = useMemo(() => weekDatesFromMonday(monday), [monday]);
  const gridDates = useMemo(
    () => (mode === "fixed" ? fixedBookingGridDates(monday) : dates),
    [dates, mode, monday]
  );
  const dayColumnCount = gridDates.length;
  const dayQueries = useQueries({
    queries: dates.map((date) => ({
      queryKey: ["court-reservations", date],
      queryFn: () => courtReservationsService.day(date),
      enabled: mode === "calendar",
      staleTime: 0,
    })),
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
      return response.json() as Promise<CourtOption[]>;
    },
  });
  const { data: fixedBookings = [] } = useQuery({
    queryKey: ["court-fixed-bookings"],
    queryFn: () => courtReservationsService.fixedBookings(),
  });

  const slotsByDay = dayQueries.map((query) => query.data ?? []);
  const loading = dayQueries.some((query) => query.isLoading);
  const loadError = dayQueries.find((query) => query.isError)?.error;

  const visibleCourts = useMemo(() => {
    if (courts.length > 0) return courts;
    const seen = new Map<number, string>();
    for (const rows of slotsByDay) {
      for (const slot of rows) seen.set(slot.court_id, slot.court_name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [courts, slotsByDay]);

  function slotAt(courtId: number, dayIndex: number, start: string): ReservationSlotView | null {
    return (
      slotsByDay[dayIndex]?.find(
        (slot) => slot.court_id === courtId && clock(slot.start_time) === start
      ) ?? null
    );
  }

  function openCell(next: CellTarget) {
    const booking = activeFixedBooking(next.courtId, weekdayOf(next.date), next.start, next.end, fixedBookings);
    setTarget(next);
    setPlayerId(mode === "fixed" ? booking?.player_id ?? null : next.slot?.reserved_player_id ?? null);
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["court-reservations"] });
    queryClient.invalidateQueries({ queryKey: ["court-fixed-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["court-slots"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Elegí un turno");
      if (playerId == null) throw new Error("Elegí un jugador");
      if (mode === "fixed") {
        await saveFixedCell(target, playerId, fixedBookings);
        return;
      }
      const booking = activeFixedBooking(target.courtId, weekdayOf(target.date), target.start, target.end, fixedBookings);
      const tone = calendarTone(target.slot, booking);
      if (tone === "fixed") throw new Error("Los turnos fijos se guardan en Turnos fijos");
      if (tone === "class" || tone === "tournament") {
        throw new Error("Ese horario está ocupado y no se puede reservar");
      }
      await saveOccasionalCell(target, playerId);
    },
    onSuccess: () => {
      toast.success(mode === "fixed" ? "Turno fijo guardado." : "Reserva guardada.");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!target?.slot || target.slot.reservation_status !== "reserved" || target.slot.reservation_source === "fixed") {
        throw new Error("Ese turno no tiene una reserva ocasional");
      }
      await courtReservationsService.cancel(target.slot.id);
    },
    onSuccess: () => {
      toast.success("Reserva cancelada.");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cancelar"),
  });

  const generateWeek = useMutation({
    mutationFn: () => courtReservationsService.generateWeek(monday),
    onSuccess: () => {
      toast.success("Semana generada.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo generar la semana"),
  });

  const releaseClass = useMutation({
    mutationFn: async (sessionId: number) => {
      if (!target?.slot) throw new Error("Elegí el turno");
      await courtReservationsService.releaseClass(target.slot.id, sessionId);
    },
    onSuccess: () => {
      toast.success("Clase cancelada. Ese horario quedó libre.");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo cancelar la clase"),
  });

  const restoreClass = useMutation({
    mutationFn: async (sessionId: number) => {
      if (!target?.slot) throw new Error("Elegí el turno");
      await courtReservationsService.restoreClass(target.slot.id, sessionId);
    },
    onSuccess: () => {
      toast.success("Clase restaurada.");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo restaurar la clase"),
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Elegí un turno");
      const booking = activeFixedBooking(target.courtId, weekdayOf(target.date), target.start, target.end, fixedBookings);
      if (!booking) throw new Error("No hay un turno fijo en ese horario");
      await courtReservationsService.deactivateFixed(booking.id);
    },
    onSuccess: () => {
      toast.success("Turno fijo quitado.");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo desactivar"),
  });

  const releaseFixedDay = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Elegí un turno");
      const bookingId =
        target.slot?.fixed_booking_id ??
        activeFixedBooking(target.courtId, weekdayOf(target.date), target.start, target.end, fixedBookings)?.id;
      if (!bookingId) throw new Error("No hay turno fijo en ese día");
      if (target.slot?.reservation_source !== "fixed") {
        throw new Error("Este día no tiene un turno fijo aplicado");
      }
      await courtReservationsService.cancelFixedDate(bookingId, target.date);
    },
    onSuccess: () => {
      toast.success("Día liberado. El turno fijo sigue para las demás semanas.");
      setTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo liberar ese día"),
  });

  const selectedCourt = visibleCourts.find((court) => court.id === courtId) ?? visibleCourts[0] ?? null;
  const missingDates =
    mode === "calendar" && selectedCourt
      ? dates.filter(
          (_, index) => !slotsByDay[index]?.some((slot) => slot.court_id === selectedCourt.id)
        )
      : [];
  const weekIsEmpty = mode === "calendar" && missingDates.length === dates.length;
  const matchedBooking = target
    ? activeFixedBooking(target.courtId, weekdayOf(target.date), target.start, target.end, fixedBookings)
    : undefined;
  const tone = target ? (mode === "fixed" ? (matchedBooking ? "fixed" : "free") : calendarTone(target.slot, matchedBooking)) : "free";
  const blocked = mode === "calendar" && (tone === "class" || tone === "tournament");
  const fixedLocked = mode === "calendar" && tone === "fixed";
  const occasional = mode === "calendar" && tone === "reserved";
  const weekdayLabel = target ? DAY_SHORT[weekdayOf(target.date)] : "";

  const dayColPercent = (100 - HOUR_COL_PERCENT) / dayColumnCount;

  return (
    <div className="min-w-0 w-full space-y-4">
      <div className={cn("rounded-lg px-3 py-2 text-sm", mode === "fixed" ? "bg-blue-600 text-white" : "bg-orange-500 text-white")}>
        {mode === "fixed"
          ? "Turnos fijos de lunes a viernes. Guardar acá deja ese horario para todas las semanas."
          : "Calendario. Guardar acá reserva solo ese día. Lo rojo es un fijo: podés liberar un día puntual o cambiar la regla en Turnos fijos."}
      </div>
      {mode === "calendar" ? <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => setMonday(addDaysIso(monday, -7))} aria-label="Semana anterior">
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <div className="min-w-[9rem] text-center text-sm font-medium">
          {shortDate(dates[0])} – {shortDate(dates[6])}
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => setMonday(addDaysIso(monday, 7))} aria-label="Semana siguiente">
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMonday(mondayOfWeek(today))}>
          Esta semana
        </Button>
        {canWrite ? (
          <Button type="button" variant="outline" onClick={() => generateWeek.mutate()} disabled={generateWeek.isPending}>
            {generateWeek.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generar esta semana
          </Button>
        ) : null}
      </div> : null}

      <div className="flex flex-wrap gap-2">
        {LEGEND.filter((item) => mode === "calendar" || item.tone === "free" || item.tone === "fixed").map((item) => (
          <span key={item.tone} className="inline-flex items-center gap-1.5 text-xs">
            <span className={cn("h-3 w-3 rounded-sm", mode === "fixed" && item.tone === "fixed" ? "bg-blue-600" : TONE_CLASS[item.tone])} />
            {item.label}
          </span>
        ))}
      </div>

      {mode === "calendar" && loading ? (
        <div className="flex justify-center py-10"><Loader2Icon className="h-5 w-5 animate-spin" /></div>
      ) : loadError ? (
        <p className="text-sm text-destructive">
          {loadError instanceof Error ? loadError.message : "No se pudieron cargar las reservas"}
        </p>
      ) : visibleCourts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay canchas activas.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1 pb-1">
            {visibleCourts.map((court) => (
              <button
                key={court.id}
                type="button"
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                  selectedCourt?.id === court.id
                    ? mode === "fixed"
                      ? "bg-blue-600 text-white"
                      : "bg-orange-500 text-white"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={() => setCourtId(court.id)}
              >
                {court.name}
              </button>
            ))}
          </div>
          {selectedCourt ? (
            <section className={cn("overflow-hidden rounded-xl border-2", mode === "fixed" ? "border-blue-600" : "border-orange-500")}>
              <h2 className={cn("border-b px-3 py-2 text-sm font-semibold text-white", mode === "fixed" ? "bg-blue-600" : "bg-orange-500")}>
                {selectedCourt.name}
              </h2>
              <div className="w-full min-w-0 overflow-x-hidden">
                {mode === "calendar" && missingDates.length > 0 ? (
                  <div className={cn("m-3 rounded-xl border border-dashed px-4 py-6 text-center", weekIsEmpty ? "border-orange-300 bg-orange-50 dark:bg-orange-950/30" : "border-border bg-muted/40")}>
                    <CalendarOffIcon className={cn("mx-auto h-8 w-8", weekIsEmpty ? "text-orange-600" : "text-muted-foreground")} />
                    <p className="mt-2 text-sm font-medium">
                      {weekIsEmpty ? "Esta semana no tiene turnos generados" : "Faltan días por generar"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {weekIsEmpty
                        ? `${shortDate(dates[0])} – ${shortDate(dates[6])}. Generala para ver reservas, clases y torneos.`
                        : missingDates.map((date) => `${DAY_SHORT[weekdayOf(date)]} ${dayNumber(date)}`).join(", ")}
                    </p>
                    {canWrite ? (
                      <Button type="button" className="mt-3" onClick={() => generateWeek.mutate()} disabled={generateWeek.isPending}>
                        {generateWeek.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Generar esta semana
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Hace falta alguien con permiso de canchas para generarlos.</p>
                    )}
                  </div>
                ) : null}
                {weekIsEmpty ? null : (
                <table className="w-full max-w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1">
                  <colgroup>
                    <col style={{ width: `${HOUR_COL_PERCENT}%` }} />
                    {gridDates.map((date) => (
                      <col key={date} style={{ width: `${dayColPercent}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="bg-background" aria-hidden />
                      {gridDates.map((date) => (
                        <th
                          key={date}
                          title={mode === "fixed" ? WEEKDAY_LABELS[weekdayOf(date)] : undefined}
                          className={cn(
                            "px-0 py-0.5 text-center text-[9px] font-medium sm:px-0.5 sm:text-[10px] md:text-[11px]",
                            date === today && mode === "calendar" && "text-foreground"
                          )}
                        >
                          <div className="truncate">
                            {mode === "fixed" ? (
                              <>
                                <span className="md:hidden">{DAY_SHORT[weekdayOf(date)]}</span>
                                <span className="hidden md:inline">{WEEKDAY_LABELS[weekdayOf(date)]}</span>
                              </>
                            ) : (
                              DAY_SHORT[weekdayOf(date)]
                            )}
                          </div>
                          {mode === "calendar" ? (
                            <div
                              className={cn(
                                "text-[10px] sm:text-xs md:text-sm",
                                date === today &&
                                  "mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background sm:h-6 sm:w-6"
                              )}
                            >
                              {dayNumber(date)}
                            </div>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STANDARD_COURT_SLOTS.map((hours) => (
                      <tr key={hours.start}>
                        <th className="bg-background pr-0.5 text-right text-[9px] font-medium text-muted-foreground sm:pr-1 sm:text-[10px] md:text-[11px]">
                          <span className="tabular-nums">{hours.start}</span>
                        </th>
                        {gridDates.map((date) => {
                          const dayIndex = dates.indexOf(date);
                          const slot = dayIndex >= 0 ? slotAt(selectedCourt.id, dayIndex, hours.start) : null;
                          if (mode === "calendar" && !slot) {
                            return (
                              <td key={date} className="p-0">
                                <div className={calendarEmptyCell} />
                              </td>
                            );
                          }
                          const rule = activeFixedBooking(selectedCourt.id, weekdayOf(date), hours.start, hours.end, fixedBookings);
                          const toneOfCell = mode === "fixed" ? (rule ? "fixed" : "free") : calendarTone(slot, rule);
                          const name = mode === "fixed" ? rule?.player_name : slot?.reserved_player_name ?? rule?.player_name;
                          const reservedToo =
                            mode === "calendar" &&
                            toneOfCell === "class" &&
                            (slot?.reservation_status === "reserved" || Boolean(rule));
                          return (
                            <td key={date} className="p-0">
                              <button
                                type="button"
                                title={cellTitle(slot, hours.start, hours.end)}
                                className={cn(
                                  calendarCell,
                                  mode === "fixed" && toneOfCell === "fixed"
                                    ? "bg-blue-600 text-white hover:bg-blue-700"
                                    : TONE_CLASS[toneOfCell],
                                  reservedToo && (slot?.reservation_source === "fixed" || rule) && "ring-2 ring-inset ring-red-700",
                                  reservedToo && slot?.reservation_source !== "fixed" && !rule && "ring-2 ring-inset ring-orange-700"
                                )}
                                onClick={() =>
                                  openCell({
                                    courtId: selectedCourt.id,
                                    courtName: selectedCourt.name,
                                    date,
                                    start: hours.start,
                                    end: hours.end,
                                    slot,
                                  })
                                }
                              >
                                <span className="max-w-full truncate">
                                  {toneOfCell === "tournament"
                                    ? "Torneo"
                                    : toneOfCell === "class"
                                      ? "Clase"
                                      : toneOfCell === "free"
                                        ? "Libre"
                                        : playerLabel(name)}
                                </span>
                                {mode === "calendar" && toneOfCell !== "class" && slot?.class_sessions?.some((session) => session.status === "cancelled") ? (
                                  <span className="absolute bottom-0 max-w-[calc(100%-2px)] truncate rounded bg-yellow-200 px-0.5 text-[8px] leading-none text-yellow-950 sm:bottom-0.5 sm:px-1 sm:text-[10px]">
                                    Cancelada
                                  </span>
                                ) : null}
                                {reservedToo ? (
                                  <span className="max-w-full truncate font-medium">{playerLabel(name)}</span>
                                ) : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <Dialog open={target != null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target
                ? mode === "fixed"
                  ? `Fijo · ${target.courtName} · ${WEEKDAY_LABELS[weekdayOf(target.date)]} · ${formatTime(target.start)}–${formatTime(target.end)}`
                  : `Este día · ${target.courtName} · ${weekdayLabel} ${shortDate(target.date)} · ${formatTime(target.start)}–${formatTime(target.end)}`
                : "Turno"}
            </DialogTitle>
          </DialogHeader>
          {target ? (
            <div className="space-y-3">
              <p className="text-sm">
                {mode === "fixed"
                  ? matchedBooking
                    ? `Fijo · ${matchedBooking.player_name}`
                    : "Disponible"
                  : cellTitle(target.slot, target.start, target.end)}
              </p>
              {tone === "tournament" ? (
                <p className="text-sm text-muted-foreground">
                  Este horario sigue el partido{target.slot?.tournament_block ? `: ${target.slot.tournament_block.label}` : ""}. Si el partido se mueve o se cancela, la celda cambia. Si el turno también está reservado o tiene clase, se muestra el torneo.
                </p>
              ) : null}
              {(target.slot?.class_sessions?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Cada clase se cancela o se restaura por su horario. Las otras clases del día no cambian.
                  </p>
                  {target.slot?.class_sessions?.map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                      <span className="min-w-0 text-sm">
                        {session.label} · {formatTime(session.start_time)}–{formatTime(session.end_time)}
                        {session.status === "cancelled" ? " · cancelada" : ""}
                      </span>
                      {canWrite ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={session.status === "cancelled" ? "default" : "outline"}
                          disabled={releaseClass.isPending || restoreClass.isPending}
                          onClick={() =>
                            session.status === "cancelled"
                              ? restoreClass.mutate(session.id)
                              : releaseClass.mutate(session.id)
                          }
                        >
                          {session.status === "cancelled" ? "Restaurar" : "Cancelar"}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {fixedLocked ? (
                <p className="text-sm text-muted-foreground">
                  Turno fijo
                  {matchedBooking?.player_name ? ` de ${matchedBooking.player_name}` : ""}. Podés liberar solo este
                  {shortDate(target.date)}; la regla semanal no se toca. Para cambiar quién lo tiene siempre, usá Turnos
                  fijos.
                </p>
              ) : canWrite && !blocked ? (
                <PlayerSearchSelect
                  players={players}
                  value={playerId}
                  onValueChange={setPlayerId}
                  placeholder="Jugador"
                />
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {canWrite && mode === "fixed" && matchedBooking ? (
              <Button type="button" variant="outline" onClick={() => deactivate.mutate()} disabled={deactivate.isPending}>
                Quitar
              </Button>
            ) : null}
            {canWrite && occasional ? (
              <Button type="button" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancelar reserva
              </Button>
            ) : null}
            {canWrite && mode === "calendar" && fixedLocked ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => releaseFixedDay.mutate()}
                disabled={releaseFixedDay.isPending}
              >
                Liberar este día
              </Button>
            ) : null}
            {canWrite && !blocked && !fixedLocked ? (
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || playerId == null}>
                {mode === "fixed" ? "Guardar" : occasional ? "Guardar jugador" : "Reservar"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function saveFixedCell(target: CellTarget, playerId: number, bookings: CourtFixedBooking[]) {
  const existing = activeFixedBooking(target.courtId, weekdayOf(target.date), target.start, target.end, bookings);
  const openEnded = {
    valid_from: todayInBuenosAires(),
    valid_until: null,
    is_active: true,
    suspended_from: null,
    suspended_until: null,
  };
  if (existing) {
    await courtReservationsService.saveFixed({
      id: existing.id,
      player_id: playerId,
      court_id: existing.court_id,
      weekday: existing.weekday,
      start_time: clock(existing.start_time),
      end_time: clock(existing.end_time),
      ...openEnded,
    });
    return;
  }
  await courtReservationsService.saveFixed({
    id: null,
    player_id: playerId,
    court_id: target.courtId,
    weekday: weekdayOf(target.date),
    start_time: target.start,
    end_time: target.end,
    ...openEnded,
  });
  if (!target.slot) {
    await courtSlotsService.generate({ date: target.date });
  }
}

async function saveOccasionalCell(target: CellTarget, playerId: number) {
  let slotId = target.slot?.id;
  if (!slotId) {
    await courtSlotsService.generate({ date: target.date });
    const rows = await courtReservationsService.day(target.date);
    slotId = rows.find(
      (slot) => slot.court_id === target.courtId && clock(slot.start_time) === target.start
    )?.id;
  }
  if (!slotId) throw new Error("No se encontró el turno");
  if (target.slot?.reservation_status === "reserved") {
    await courtReservationsService.setPlayer(slotId, playerId);
    return;
  }
  await courtReservationsService.reserve(slotId, playerId);
}
