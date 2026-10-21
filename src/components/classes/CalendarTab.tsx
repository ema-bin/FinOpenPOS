"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classesService } from "@/services/classes.service";
import {
  CLASS_DURATION_MINUTES,
  CLASS_GRID_START_MINUTES,
  CLASS_PLAYER_LIMIT,
  WEEKDAY_LABELS,
  classFitsInDay,
  endTimeAfter,
  formatTimeShort,
  freeClassSpots,
  minutesOf,
  pad2,
  snapClassStart,
} from "@/lib/class-time";
import type { ClassSchedule } from "@/models/db/class";
import { PlayerSearch, type PlayerHit } from "./PlayerSearch";

type CourtOption = { id: number; name: string };

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const HOUR_PX = 56;
const GRID_HOURS = Array.from({ length: 18 }, (_, index) => 6 + index);
const GRID_HEIGHT = GRID_HOURS.length * HOUR_PX;

type DraftSlot = { weekday: number; startTime: string };

function spotClasses(free: number, selected: boolean): string {
  const ring = selected ? "ring-2 ring-primary" : "";
  if (free <= 0) return `bg-red-100 text-red-950 border border-red-200 ${ring}`;
  if (free <= 2) return `bg-amber-200 text-amber-950 border border-amber-300 ${ring}`;
  return `bg-orange-100 text-orange-950 border border-orange-200 ${ring}`;
}

function endLabel(start: string): string {
  return formatTimeShort(endTimeAfter(start, CLASS_DURATION_MINUTES));
}

function placeByLane(schedules: ClassSchedule[]): Array<{ schedule: ClassSchedule; lane: number; lanes: number }> {
  const sorted = [...schedules].sort(
    (a, b) => minutesOf(a.start_time) - minutesOf(b.start_time) || a.id - b.id
  );
  const laneEnds: number[] = [];
  const lanes: number[] = [];
  for (const schedule of sorted) {
    const start = minutesOf(schedule.start_time);
    const end = start + CLASS_DURATION_MINUTES;
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.push(lane);
  }
  const count = Math.max(1, laneEnds.length);
  return sorted.map((schedule, index) => ({ schedule, lane: lanes[index], lanes: count }));
}

export function CalendarTab() {
  const queryClient = useQueryClient();
  const [courtFilter, setCourtFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftSlot | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ["classes", "schedules"],
    queryFn: () => classesService.listSchedules(),
  });
  const courtsQuery = useQuery({
    queryKey: ["courts", "active"],
    queryFn: async () => {
      const response = await fetch("/api/courts");
      if (!response.ok) throw new Error("No se pudieron cargar las canchas");
      return (await response.json()) as CourtOption[];
    },
  });
  const professorsQuery = useQuery({
    queryKey: ["classes", "professors"],
    queryFn: () => classesService.listProfessors(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["classes", "schedules"] });
    queryClient.invalidateQueries({ queryKey: ["classes", "sessions"] });
  };

  const enrollMutation = useMutation({
    mutationFn: (input: { scheduleId: number; playerId: number }) =>
      classesService.addEnrollment(input.scheduleId, input.playerId),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo anotar"),
  });

  const endMutation = useMutation({
    mutationFn: (id: number) => classesService.endEnrollment(id),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo quitar"),
  });

  const saveMutation = useMutation({
    mutationFn: (input: {
      id: number;
      weekday: number;
      startTime: string;
      professorId: number;
      courtId: number;
    }) =>
      classesService.updateSchedule(input.id, {
        weekday: input.weekday,
        startTime: input.startTime,
        professorId: input.professorId,
        courtId: input.courtId,
      }),
    onSuccess: () => {
      toast.success("Clase actualizada");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo actualizar la clase"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => classesService.updateSchedule(id, { isActive: false }),
    onSuccess: () => {
      setSelectedId(null);
      toast.success("Clase quitada");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo quitar la clase"),
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      professorId: number;
      courtId: number;
      weekday: number;
      startTime: string;
      playerIds: number[];
    }) => classesService.createSchedule(input),
    onSuccess: () => {
      setDraft(null);
      toast.success("Clase creada");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo crear la clase"),
  });

  const schedules = (schedulesQuery.data ?? []).filter((schedule) => schedule.is_active);
  const visible = schedules.filter((schedule) => courtFilter === "all" || String(schedule.court_id) === courtFilter);
  const selected = schedules.find((schedule) => schedule.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Semana fija, de lunes a domingo. El mes se usa solo para el cobro.
        </p>
        <Select value={courtFilter} onValueChange={setCourtFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Cancha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las canchas</SelectItem>
            {(courtsQuery.data ?? []).map((court) => (
              <SelectItem key={court.id} value={String(court.id)}>
                {court.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {schedulesQuery.isError && (
        <p className="text-sm text-destructive">
          {schedulesQuery.error instanceof Error ? schedulesQuery.error.message : "No se pudo armar el calendario"}
        </p>
      )}
      {schedulesQuery.isLoading && <p className="text-sm text-muted-foreground">Armando la semana...</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-md border">
          <div className="grid min-w-[880px]" style={{ gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))" }}>
            <div className="sticky top-0 z-20 border-b bg-background" />
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="sticky top-0 z-20 border-b border-l bg-background px-1 py-2 text-center text-sm font-medium">
                {WEEKDAY_LABELS[weekday]}
              </div>
            ))}
            <div className="relative border-t" style={{ height: GRID_HEIGHT }}>
              {GRID_HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-1 text-[11px] text-muted-foreground"
                  style={{ top: (hour - 6) * HOUR_PX + 2 }}
                >
                  {pad2(hour)}:00
                </div>
              ))}
              <div className="absolute bottom-0 right-1 text-[11px] text-muted-foreground">00:00</div>
            </div>
            {WEEKDAYS.map((weekday) => (
              <DayColumn
                key={weekday}
                weekday={weekday}
                schedules={visible.filter((schedule) => schedule.weekday === weekday)}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCreate={(startTime) => setDraft({ weekday, startTime })}
              />
            ))}
          </div>
        </div>

        <ClassDetail
          schedule={selected}
          courts={courtsQuery.data ?? []}
          professors={(professorsQuery.data?.professors ?? []).filter(
            (professor) => professor.is_active || professor.id === selected?.professor_id
          )}
          saving={saveMutation.isPending}
          onSave={(input) => {
            if (!selected) return;
            saveMutation.mutate({ id: selected.id, ...input });
          }}
          onAdd={(playerId) => {
            if (!selected) return;
            enrollMutation.mutate({ scheduleId: selected.id, playerId });
          }}
          onRemove={(enrollmentId) => endMutation.mutate(enrollmentId)}
          onRemoveClass={() => {
            if (!selected) return;
            removeMutation.mutate(selected.id);
          }}
          removing={removeMutation.isPending}
        />
      </div>

      <CreateClassDialog
        key={draft ? `${draft.weekday}-${draft.startTime}` : "nueva-clase"}
        draft={draft}
        courts={courtsQuery.data ?? []}
        professors={(professorsQuery.data?.professors ?? []).filter((professor) => professor.is_active)}
        defaultCourtId={courtFilter === "all" ? "" : courtFilter}
        saving={createMutation.isPending}
        onClose={() => setDraft(null)}
        onCreate={(input) => createMutation.mutate(input)}
      />
    </div>
  );
}

function DayColumn({
  weekday,
  schedules,
  selectedId,
  onSelect,
  onCreate,
}: {
  weekday: number;
  schedules: ClassSchedule[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (startTime: string) => void;
}) {
  const placed = placeByLane(schedules);
  return (
    <div
      className="relative cursor-pointer border-l border-t"
      style={{ height: GRID_HEIGHT }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
        const minutes = CLASS_GRID_START_MINUTES + (y / HOUR_PX) * 60;
        onCreate(snapClassStart(minutes));
      }}
    >
      {GRID_HOURS.map((hour) => (
        <div
          key={hour}
          className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
          style={{ top: (hour - 6) * HOUR_PX }}
        />
      ))}
      {placed.map(({ schedule, lane, lanes }) => {
        const start = minutesOf(schedule.start_time);
        const top = ((start - CLASS_GRID_START_MINUTES) / 60) * HOUR_PX + 1;
        const free = freeClassSpots(schedule.enrollments.length);
        return (
          <button
            key={schedule.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(schedule.id);
            }}
            className={`absolute overflow-hidden rounded px-1 py-0.5 text-left text-[11px] font-medium leading-tight ${spotClasses(free, schedule.id === selectedId)}`}
            style={{
              top,
              height: HOUR_PX - 2,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            }}
          >
            <div>
              {formatTimeShort(schedule.start_time)}–{endLabel(schedule.start_time)} · {free} libres
            </div>
            <div className="truncate font-normal">
              {schedule.professor?.name ?? "Clase"}
              {schedule.court?.name ? ` · ${schedule.court.name}` : ""}
            </div>
            {schedule.enrollments.length > 0 && (
              <div className="truncate font-normal">
                {schedule.enrollments
                  .map((enrollment) => enrollment.player?.last_name || enrollment.player?.first_name || "Jugador")
                  .join(", ")}
              </div>
            )}
          </button>
        );
      })}
      <span className="sr-only">{WEEKDAY_LABELS[weekday]}</span>
    </div>
  );
}

function ClassDetail({
  schedule,
  courts,
  professors,
  saving,
  onSave,
  onAdd,
  onRemove,
  onRemoveClass,
  removing,
}: {
  schedule: ClassSchedule | null;
  courts: CourtOption[];
  professors: Array<{ id: number; name: string }>;
  saving: boolean;
  onSave: (input: {
    weekday: number;
    startTime: string;
    professorId: number;
    courtId: number;
  }) => void;
  onAdd: (playerId: number) => void;
  onRemove: (enrollmentId: number) => void;
  onRemoveClass: () => void;
  removing: boolean;
}) {
  const savedWeekday = schedule ? String(schedule.weekday) : "";
  const savedTime = schedule ? formatTimeShort(schedule.start_time) : "";
  const savedProfessor = schedule ? String(schedule.professor_id) : "";
  const savedCourt = schedule ? String(schedule.court_id) : "";
  const [weekday, setWeekday] = useState(savedWeekday);
  const [startTime, setStartTime] = useState(savedTime);
  const [professorId, setProfessorId] = useState(savedProfessor);
  const [courtId, setCourtId] = useState(savedCourt);

  useEffect(() => {
    setWeekday(savedWeekday);
    setStartTime(savedTime);
    setProfessorId(savedProfessor);
    setCourtId(savedCourt);
  }, [schedule?.id, savedWeekday, savedTime, savedProfessor, savedCourt]);

  if (!schedule) {
    return (
      <aside className="rounded-md border p-4 text-sm text-muted-foreground">
        Elegí una clase para verla, o hacé clic en un horario vacío para crear una.
      </aside>
    );
  }

  const free = freeClassSpots(schedule.enrollments.length);
  const full = schedule.enrollments.length >= CLASS_PLAYER_LIMIT;
  const timeOk = classFitsInDay(startTime);
  const dirty =
    weekday !== savedWeekday ||
    startTime !== savedTime ||
    professorId !== savedProfessor ||
    courtId !== savedCourt;

  return (
    <aside className="space-y-3 rounded-md border p-4 text-sm">
      <div>
        <p className="text-xs uppercase text-muted-foreground">Día</p>
        <Select value={weekday || undefined} onValueChange={setWeekday}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEEKDAYS.map((day) => (
              <SelectItem key={day} value={String(day)}>
                {WEEKDAY_LABELS[day]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Horario</p>
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="time"
            min="06:00"
            max="23:00"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <span className="shrink-0 text-muted-foreground">a {startTime ? endLabel(startTime) : "—"}</span>
        </div>
        {!timeOk && <p className="mt-1 text-xs text-destructive">Tiene que entrar entre las 06:00 y las 00:00.</p>}
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Profesor</p>
        <Select value={professorId || undefined} onValueChange={setProfessorId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Profesor" />
          </SelectTrigger>
          <SelectContent>
            {professors.map((professor) => (
              <SelectItem key={professor.id} value={String(professor.id)}>
                {professor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Cancha</p>
        <Select value={courtId || undefined} onValueChange={setCourtId}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {courts.map((court) => (
              <SelectItem key={court.id} value={String(court.id)}>
                {court.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        disabled={!dirty || !timeOk || !weekday || !professorId || !courtId || saving}
        onClick={() =>
          onSave({
            weekday: Number(weekday),
            startTime,
            professorId: Number(professorId),
            courtId: Number(courtId),
          })
        }
      >
        Guardar
      </Button>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Jugadores</p>
        {schedule.enrollments.length === 0 ? (
          <p className="text-muted-foreground">Nadie anotado.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {schedule.enrollments.map((enrollment, index) => (
              <li key={enrollment.id} className="flex items-center justify-between gap-2">
                <span>
                  {index + 1}.{" "}
                  {enrollment.player
                    ? `${enrollment.player.last_name}, ${enrollment.player.first_name}`
                    : "Jugador"}
                </span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onRemove(enrollment.id)}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p>Libres: {free} libres</p>
      {!full && (
        <PlayerSearch
          excludeIds={schedule.enrollments.map((enrollment) => enrollment.player_id)}
          onPick={(player) => onAdd(player.id)}
          placeholder="Agregar jugador"
        />
      )}
      {full && <p className="text-muted-foreground">Cupo completo.</p>}
      <Button variant="outline" disabled={removing} onClick={onRemoveClass}>
        Quitar clase
      </Button>
    </aside>
  );
}

function CreateClassDialog({
  draft,
  courts,
  professors,
  defaultCourtId,
  saving,
  onClose,
  onCreate,
}: {
  draft: DraftSlot | null;
  courts: CourtOption[];
  professors: Array<{ id: number; name: string }>;
  defaultCourtId: string;
  saving: boolean;
  onClose: () => void;
  onCreate: (input: {
    professorId: number;
    courtId: number;
    weekday: number;
    startTime: string;
    playerIds: number[];
  }) => void;
}) {
  const [professorId, setProfessorId] = useState("");
  const [courtId, setCourtId] = useState(defaultCourtId);
  const [startTime, setStartTime] = useState(draft?.startTime ?? "08:00");
  const [players, setPlayers] = useState<PlayerHit[]>([]);

  const dayLabel = draft ? WEEKDAY_LABELS[draft.weekday] : "";
  const timeOk = classFitsInDay(startTime);

  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva clase · {dayLabel}</DialogTitle>
        </DialogHeader>
        {draft && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Queda fija todas las semanas. Dura una hora.</p>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                min="06:00"
                max="23:00"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
              <span className="shrink-0 text-muted-foreground">a {startTime ? endLabel(startTime) : "—"}</span>
            </div>
            {!timeOk && <p className="text-destructive">Tiene que entrar entre las 06:00 y las 00:00.</p>}
            <Select value={professorId || undefined} onValueChange={setProfessorId}>
              <SelectTrigger>
                <SelectValue placeholder="Profesor" />
              </SelectTrigger>
              <SelectContent>
                {professors.map((professor) => (
                  <SelectItem key={professor.id} value={String(professor.id)}>
                    {professor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {professors.length === 0 && (
              <p className="text-muted-foreground">Primero cargá un profesor en la pestaña Profesores.</p>
            )}
            <Select value={courtId || undefined} onValueChange={setCourtId}>
              <SelectTrigger>
                <SelectValue placeholder="Cancha" />
              </SelectTrigger>
              <SelectContent>
                {courts.map((court) => (
                  <SelectItem key={court.id} value={String(court.id)}>
                    {court.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">
                Jugadores ({players.length}/{CLASS_PLAYER_LIMIT})
              </p>
              {players.length === 0 ? (
                <p className="text-muted-foreground">Todavía no hay nadie.</p>
              ) : (
                <ul className="space-y-1">
                  {players.map((player, index) => (
                    <li key={player.id} className="flex items-center justify-between gap-2">
                      <span>
                        {index + 1}. {player.last_name}, {player.first_name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setPlayers((current) => current.filter((item) => item.id !== player.id))}
                      >
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {players.length < CLASS_PLAYER_LIMIT && (
              <PlayerSearch
                excludeIds={players.map((player) => player.id)}
                onPick={(player) => setPlayers((current) => [...current, player])}
                placeholder="Agregar jugador"
              />
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!draft || !professorId || !courtId || !timeOk || saving}
            onClick={() => {
              if (!draft) return;
              onCreate({
                professorId: Number(professorId),
                courtId: Number(courtId),
                weekday: draft.weekday,
                startTime,
                playerIds: players.map((player) => player.id),
              });
            }}
          >
            Crear clase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
