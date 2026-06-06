"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScheduleDaysEditor, type ScheduleDay as ScheduleDayEditor } from "@/components/schedule-days-editor";
import type {
  ScheduleDay,
  ScheduleConfig,
  SchedulePhysicalSlotCourtSelection,
} from "@/models/dto/tournament";

export type { ScheduleDay, ScheduleConfig };
export type { SchedulePhysicalSlotCourtSelection };

type GroupSlot = {
  id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  tournament_id?: number;
  tournament_name?: string;
};
type PhysicalSlotSelection = {
  slotDate: string;
  startTime: string;
  endTime: string;
  courtId: number;
};
type OverlapTournamentOption = { id: number; name: string; status: string };

type TournamentScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: ScheduleConfig) => void;
  matchCount: number; // cantidad de partidos a programar
  tournamentMatchDuration?: number; // duración del partido del torneo (en minutos)
  /** Duración de playoffs (todas las rondas); si está definido, la grilla de esta pantalla usa solo este valor */
  tournamentMatchDurationQuartersOnwards?: number;
  availableSchedules?: Array<{ date: string; start_time: string; end_time: string }>; // Horarios disponibles del torneo para pre-llenar (modo sin stream)
  tournamentId?: number; // ID del torneo para usar con SSE
  /** Revisión global: mismo flujo que regenerate-schedule-stream pero para todos los torneos en schedule_review */
  globalScheduleReview?: boolean;
  showLogs?: boolean; // Si mostrar la bitácora de logs
  streamEndpoint?: string; // Endpoint para el stream (por defecto: close-registration-stream)
  /** Playoffs: definir días propios y elegir ventanas por cancha (independiente de fechas de zona) */
  preferTournamentSlotGrid?: boolean;
  /** Playoffs global: mismos días compartidos para todos los torneos listos */
  globalPlayoffsReady?: boolean;
  error?: string | null; // Error a mostrar
  isLoading?: boolean; // Si está cargando
};

import type { CourtDTO } from "@/models/dto/court";
import { listAtomicPlayoffSlotWindows } from "@/lib/playoff-expand-selected-slots";

// Inicializar días desde horarios disponibles si existen
function getInitialDays(availableSchedules: Array<{ date: string; start_time: string; end_time: string }>): ScheduleDayEditor[] {
  if (availableSchedules.length > 0) {
    return availableSchedules.map((schedule) => ({
      date: schedule.date,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
    }));
  }
  // Si no hay horarios disponibles, usar valores por defecto
  return [
    {
      date: "",
      startTime: "18:00",
      endTime: "22:00",
    },
  ];
}

/** Orden cronológico para filas slot × cancha (fecha ISO + HH:MM). */
function sortPhysicalSlotRows<
  T extends { slotDate: string; startTime: string; endTime: string; courtId: number },
>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const byDate = a.slotDate.localeCompare(b.slotDate);
    if (byDate !== 0) return byDate;
    const byStart = a.startTime.localeCompare(b.startTime);
    if (byStart !== 0) return byStart;
    const byEnd = a.endTime.localeCompare(b.endTime);
    if (byEnd !== 0) return byEnd;
    return a.courtId - b.courtId;
  });
}

export function TournamentScheduleDialog({
  open,
  onOpenChange,
  onConfirm,
  matchCount,
  tournamentMatchDuration = 60,
  tournamentMatchDurationQuartersOnwards,
  error = null,
  isLoading = false,
  availableSchedules = [],
  tournamentId,
  globalScheduleReview = false,
  showLogs = false,
  streamEndpoint = "close-registration-stream",
  preferTournamentSlotGrid = false,
  globalPlayoffsReady = false,
}: TournamentScheduleDialogProps) {
  const [days, setDays] = useState<ScheduleDayEditor[]>(() => getInitialDays(availableSchedules));
  const [matchDuration, setMatchDuration] = useState<number>(tournamentMatchDuration);
  const [courts, setCourts] = useState<CourtDTO[]>([]);
  const [selectedCourtIds, setSelectedCourtIds] = useState<number[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [groupSlots, setGroupSlots] = useState<GroupSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [selectedPhysicalSlotKeys, setSelectedPhysicalSlotKeys] = useState<string[]>([]);
  const [useRestrictionsAlgorithm, setUseRestrictionsAlgorithm] = useState(true);
  const [overlapTournaments, setOverlapTournaments] = useState<OverlapTournamentOption[]>([]);
  const [loadingOverlapTournaments, setLoadingOverlapTournaments] = useState(false);
  const [selectedOverlapTournamentIds, setSelectedOverlapTournamentIds] = useState<number[]>([]);
  const [logs, setLogs] = useState<Array<{ message: string; timestamp: Date }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [resolvedGlobalMatchCount, setResolvedGlobalMatchCount] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const wasOpenRef = useRef<boolean>(false);
  const isCompletedRef = useRef<boolean>(false);

  const playoffsCalendarPick = Boolean(
    (preferTournamentSlotGrid &&
      tournamentId &&
      !globalScheduleReview &&
      !showLogs &&
      !globalPlayoffsReady) ||
    globalPlayoffsReady
  );
  const streamUsesSlotMode = Boolean(showLogs && (tournamentId || globalScheduleReview));
  const useSlotMode = streamUsesSlotMode || playoffsCalendarPick;
  const showOverlapTournamentSelector =
    useSlotMode &&
    streamEndpoint === "regenerate-schedule-stream" &&
    Boolean(tournamentId);

  // Key única para sessionStorage basada en tournamentId y streamEndpoint
  const storageKey = useMemo(() => {
    if (globalScheduleReview) {
      return "tournament-schedule-dialog-global-schedule-review";
    }
    if (globalPlayoffsReady) {
      return "tournament-schedule-dialog-global-playoffs-ready";
    }
    return `tournament-schedule-dialog-${tournamentId}-${streamEndpoint}`;
  }, [globalScheduleReview, globalPlayoffsReady, tournamentId, streamEndpoint]);

  const effectiveMatchCount =
    (globalScheduleReview || globalPlayoffsReady) && resolvedGlobalMatchCount !== null
      ? resolvedGlobalMatchCount
      : matchCount;

  /** Stream: combinaciones desde slots de zona; playoffs: días propios definidos arriba */
  const physicalSlotOptionsSingleBase = useMemo(() => {
    type OptItem = {
      key: string;
      slotDate: string;
      startTime: string;
      endTime: string;
      courtId: number;
      courtName: string;
      tournamentGroupSlotId?: number;
      label: string;
    };
    if (!useSlotMode || selectedCourtIds.length === 0) {
      return [] as OptItem[];
    }

    const courtById = new Map(courts.map((c) => [c.id, c]));

    if (playoffsCalendarPick) {
      const playoffDays = days.filter(
        (d) => d.date && d.startTime && d.endTime
      );
      const options: OptItem[] = [];
      for (const day of playoffDays) {
        const slotDate = String(day.date).trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) continue;
        const windowStart = String(day.startTime).trim().slice(0, 5);
        const windowEnd = String(day.endTime).trim().slice(0, 5);
        if (!windowStart || !windowEnd) continue;
        const [y, m, d] = slotDate.split("-").map(Number);
        const dateLabel = new Date(y, m - 1, d).toLocaleDateString("es-AR", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        const atomicSlots = listAtomicPlayoffSlotWindows(
          slotDate,
          windowStart,
          windowEnd,
          matchDuration
        );
        for (const atomic of atomicSlots) {
          for (const courtId of selectedCourtIds) {
            const court = courtById.get(courtId);
            if (!court) continue;
            options.push({
              key: `po|${atomic.date}|${atomic.startTime}|${courtId}`,
              slotDate: atomic.date,
              startTime: atomic.startTime,
              endTime: atomic.endTime,
              courtId,
              courtName: court.name,
              label: `${dateLabel} ${atomic.startTime}–${atomic.endTime}`,
            });
          }
        }
      }
      return sortPhysicalSlotRows(options);
    }

    if (!groupSlots?.length) {
      return [] as OptItem[];
    }

    if (globalScheduleReview) {
      const uniqueWindows = new Map<
        string,
        { slotDate: string; startTime: string; endTime: string }
      >();
      for (const slot of groupSlots) {
        const slotDate = String(slot.slot_date).trim().slice(0, 10);
        const startTime = String(slot.start_time).trim().slice(0, 5);
        const endTime = String(slot.end_time).trim().slice(0, 5);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate) || !startTime || !endTime) continue;
        const windowKey = `${slotDate}|${startTime}|${endTime}`;
        if (!uniqueWindows.has(windowKey)) {
          uniqueWindows.set(windowKey, { slotDate, startTime, endTime });
        }
      }

      const allFromWindows: OptItem[] = [];
      for (const w of Array.from(uniqueWindows.values())) {
        const [y, m, d] = w.slotDate.split("-").map(Number);
        const dateLabel = new Date(y, m - 1, d).toLocaleDateString("es-AR", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        for (const courtId of selectedCourtIds) {
          const court = courtById.get(courtId);
          if (!court) continue;
          allFromWindows.push({
            key: `g|${w.slotDate}|${w.startTime}|${w.endTime}|${courtId}`,
            slotDate: w.slotDate,
            startTime: w.startTime,
            endTime: w.endTime,
            courtId,
            courtName: court.name,
            label: `${dateLabel} ${w.startTime}–${w.endTime}`,
          });
        }
      }
      return sortPhysicalSlotRows(allFromWindows);
    }

    const allFromDb: OptItem[] = [];
    for (const slot of groupSlots) {
      const slotDate = String(slot.slot_date).trim().slice(0, 10);
      const startTime = String(slot.start_time).trim().slice(0, 5);
      const endTime = String(slot.end_time).trim().slice(0, 5);
      const [y, m, d] = slotDate.split("-").map(Number);
      const dateLabel = new Date(y, m - 1, d).toLocaleDateString("es-AR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      for (const courtId of selectedCourtIds) {
        const court = courtById.get(courtId);
        if (!court) continue;
        allFromDb.push({
          key: `${slot.id}|${courtId}`,
          slotDate,
          startTime,
          endTime,
          courtId,
          courtName: court.name,
          tournamentGroupSlotId: slot.id,
          label: `${dateLabel} ${startTime}–${endTime}`,
        });
      }
    }
    return sortPhysicalSlotRows(allFromDb);
  }, [
    useSlotMode,
    playoffsCalendarPick,
    globalScheduleReview,
    days,
    matchDuration,
    groupSlots,
    selectedCourtIds,
    courts,
  ]);

  const physicalSlotOptionsSingle = useMemo(() => {
    if (!playoffsCalendarPick) {
      return physicalSlotOptionsSingleBase;
    }
    if (!days.some((d) => d.date)) {
      return [];
    }
    return physicalSlotOptionsSingleBase;
  }, [playoffsCalendarPick, days, physicalSlotOptionsSingleBase]);

  useEffect(() => {
    if (open && globalPlayoffsReady) {
      setResolvedGlobalMatchCount(matchCount);
    }
  }, [open, globalPlayoffsReady, matchCount]);

  // Cargar slots del torneo (solo revisión global / streams SSE)
  useEffect(() => {
    if (!open || playoffsCalendarPick) {
      if (playoffsCalendarPick) {
        setGroupSlots([]);
        setLoadingSlots(false);
      } else {
        setGroupSlots(null);
        setResolvedGlobalMatchCount(null);
      }
      return;
    }
    if (!showLogs) {
      setGroupSlots(null);
      setResolvedGlobalMatchCount(null);
      return;
    }
    if (!tournamentId && !globalScheduleReview) {
      setGroupSlots(null);
      setResolvedGlobalMatchCount(null);
      return;
    }
    setLoadingSlots(true);
    const url = globalScheduleReview
      ? "/api/tournaments/schedule-review/group-slots"
      : `/api/tournaments/${tournamentId}/group-slots`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Error al cargar slots"))))
      .then(
        (
          data:
            | GroupSlot[]
            | { slots?: GroupSlot[]; pendingGroupMatchCount?: number }
        ) => {
          if (globalScheduleReview && data && !Array.isArray(data)) {
            const slots = Array.isArray(data.slots) ? data.slots : [];
            setGroupSlots(slots);
            setSelectedSlotIds(slots.map((s) => s.id));
            setResolvedGlobalMatchCount(
              typeof data.pendingGroupMatchCount === "number"
                ? data.pendingGroupMatchCount
                : 0
            );
            return;
          }
          const list = Array.isArray(data) ? data : [];
          setGroupSlots(list);
          if (globalScheduleReview) {
            setSelectedSlotIds(list.map((s) => s.id));
          } else {
            setSelectedSlotIds([]);
          }
          setResolvedGlobalMatchCount(null);
        }
      )
      .catch(() => {
        setGroupSlots([]);
        setSelectedSlotIds([]);
        setResolvedGlobalMatchCount(globalScheduleReview ? 0 : null);
      })
      .finally(() => setLoadingSlots(false));
  }, [open, tournamentId, showLogs, globalScheduleReview, playoffsCalendarPick]);

  useEffect(() => {
    if (!open || !useSlotMode) {
      return;
    }
    if (physicalSlotOptionsSingle.length === 0) {
      setSelectedPhysicalSlotKeys([]);
      return;
    }
    const allKeys = physicalSlotOptionsSingle.map((o) => o.key);
    const allKeysSet = new Set(allKeys);
    setSelectedPhysicalSlotKeys((prev) => {
      if (playoffsCalendarPick) {
        return prev.filter((key) => allKeysSet.has(key));
      }
      if (prev.length === 0) return allKeys;
      const filtered = prev.filter((key) => allKeysSet.has(key));
      return filtered.length > 0 ? filtered : allKeys;
    });
  }, [open, useSlotMode, physicalSlotOptionsSingle, playoffsCalendarPick]);

  useEffect(() => {
    if (!open || !showOverlapTournamentSelector || !tournamentId) {
      setOverlapTournaments([]);
      setSelectedOverlapTournamentIds([]);
      return;
    }

    setLoadingOverlapTournaments(true);
    fetch("/api/tournaments?status=schedule_review,in_progress")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Error al cargar torneos"))))
      .then((data: Array<{ id: number; name: string; status: string }>) => {
        const candidates = Array.isArray(data)
          ? data
              .filter((t) => t.id !== tournamentId)
              .map((t) => ({ id: t.id, name: t.name, status: t.status }))
          : [];
        setOverlapTournaments(candidates);
        setSelectedOverlapTournamentIds([]);
      })
      .catch(() => {
        setOverlapTournaments([]);
        setSelectedOverlapTournamentIds([]);
      })
      .finally(() => setLoadingOverlapTournaments(false));
  }, [open, showOverlapTournamentSelector, tournamentId]);

  // Estabilizar availableSchedules para evitar loops infinitos
  const availableSchedulesKey = useMemo(() => {
    return availableSchedules.map(s => `${s.date}-${s.start_time}-${s.end_time}`).join('|');
  }, [availableSchedules]);

  // Leer estado de completado y logs desde sessionStorage al montar
  useEffect(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const savedCompleted = sessionStorage.getItem(storageKey);
      if (savedCompleted === 'true') {
        isCompletedRef.current = true;
        setIsCompleted(true);
        setIsLogsExpanded(true);
        // Intentar recuperar logs guardados
        const savedLogsKey = `${storageKey}-logs`;
        const savedLogs = sessionStorage.getItem(savedLogsKey);
        if (savedLogs) {
          try {
            const parsedLogs = JSON.parse(savedLogs);
            // Convertir timestamps de string a Date
            const logsWithDates = parsedLogs.map((log: { message: string; timestamp: string | Date }) => ({
              ...log,
              timestamp: typeof log.timestamp === 'string' ? new Date(log.timestamp) : log.timestamp,
            }));
            setLogs(logsWithDates);
          } catch (e) {
            console.error("Error parsing saved logs:", e);
          }
        }
      }
    }
  }, [storageKey]);

  const effectiveGridDuration = useMemo(() => {
    if (tournamentMatchDurationQuartersOnwards !== undefined) {
      return Math.max(30, tournamentMatchDurationQuartersOnwards);
    }
    return Math.max(30, tournamentMatchDuration);
  }, [tournamentMatchDuration, tournamentMatchDurationQuartersOnwards]);

  // Inicializar matchDuration y días cuando el dialog se abre por primera vez
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // El dialog se está abriendo por primera vez o después de estar cerrado
      setMatchDuration(effectiveGridDuration);
      setDays(
        playoffsCalendarPick
          ? [{ date: "", startTime: "18:00", endTime: "22:00" }]
          : getInitialDays(availableSchedules)
      );
      wasOpenRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveGridDuration, availableSchedulesKey]);

  // Resetear logs y estado cuando el dialog se abre/cierra
  // Solo resetear si el dialog se está abriendo después de estar cerrado (no si ya estaba abierto)
  useEffect(() => {
    // Si el proceso ya está completado y el dialog está abierto, no resetear nada
    // Esto previene que se resetee cuando el componente padre se re-renderiza
    if (open && isCompletedRef.current) {
      return; // Preservar todo el estado cuando está completado
    }
    
    // Solo procesar cambios cuando el dialog cambia de estado (abrir/cerrar)
    if (open && !wasOpenRef.current) {
      // Solo resetear logs y estado si no está completado (preservar logs si ya se completó)
      const shouldReset = !isCompletedRef.current;
      if (shouldReset) {
        setLogs([]);
        setProgress(0);
        setStatus("");
        setIsProcessing(false);
        setIsLogsExpanded(false);
      }
      // Cancelar cualquier proceso en curso (solo si no está completado)
      if (abortControllerRef.current && shouldReset) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    } else if (!open && wasOpenRef.current) {
      // El dialog se cerró después de estar abierto
      wasOpenRef.current = false;
      setSelectedPhysicalSlotKeys([]);
      // Si se cierra, resetear el estado completado para la próxima vez
      setIsCompleted(false);
      isCompletedRef.current = false;
      // Limpiar sessionStorage cuando se cierra el dialog
      if (typeof window !== 'undefined' && storageKey) {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(`${storageKey}-logs`);
      }
    }
    // Solo depender de 'open' para evitar re-ejecuciones cuando cambian las props del torneo
  }, [open, storageKey]);

  // Cargar canchas al abrir el diálogo
  useEffect(() => {
    if (open) {
      setLoadingCourts(true);
      fetch("/api/courts?onlyActive=true")
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch courts");
          }
          return res.json();
        })
        .then((data: CourtDTO[] | { error?: string }) => {
          // Asegurar que sea un array
          const courtsArray = Array.isArray(data) ? data : [];
          setCourts(courtsArray);
          // Seleccionar todas las canchas activas por defecto
          setSelectedCourtIds(courtsArray.map((c) => c.id));
        })
        .catch((err) => {
          console.error("Error fetching courts:", err);
          setCourts([]);
          setSelectedCourtIds([]);
        })
        .finally(() => {
          setLoadingCourts(false);
        });
    }
  }, [open]);

  const handleDaysChange = (newDays: ScheduleDayEditor[]) => {
    setDays(newDays);
  };

  // Función para cancelar el proceso
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLogs((prev) => [...prev, { message: "⚠️ Cancelando proceso...", timestamp: new Date() }]);
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedCourtIds.length === 0) {
      alert("Debes seleccionar al menos una cancha");
      return;
    }

    const dayHasInvalidTimeRange = (d: ScheduleDayEditor) => {
      const [startH, startM] = d.startTime.split(":").map(Number);
      const [endH, endM] = d.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH === 0 && endM === 0 ? 24 * 60 : endH * 60 + endM;
      return startMinutes >= endMinutes;
    };

    if (playoffsCalendarPick) {
      if (!days.some((d) => d.date)) {
        alert("Agregá al menos un día de playoff con fecha y horario.");
        return;
      }
      if (days.some((d) => d.date && dayHasInvalidTimeRange(d))) {
        alert("La hora de inicio debe ser anterior a la hora de fin en cada día de playoff.");
        return;
      }
      if (selectedPhysicalSlotKeys.length === 0) {
        alert("Seleccioná al menos una ventana horaria por cancha.");
        return;
      }
    } else if (useSlotMode) {
      if (selectedPhysicalSlotKeys.length === 0) {
        alert("Seleccioná al menos una combinación de horario del torneo y cancha.");
        return;
      }
    } else {
      if (days.some((d) => !d.date)) {
        alert("Todos los días deben tener una fecha");
        return;
      }
      if (days.some((d) => dayHasInvalidTimeRange(d))) {
        alert("La hora de inicio debe ser anterior a la hora de fin");
        return;
      }
    }

    const scheduleDays: ScheduleDay[] = useSlotMode
      ? []
      : days.map((d) => ({ date: d.date, startTime: d.startTime, endTime: d.endTime }));

    const playoffsPhysicalSelections: SchedulePhysicalSlotCourtSelection[] =
      !showLogs && playoffsCalendarPick
        ? physicalSlotOptionsSingle
            .filter((option) => selectedPhysicalSlotKeys.includes(option.key))
            .map((option) => ({
              tournamentGroupSlotId: option.tournamentGroupSlotId,
              courtId: option.courtId,
              slotDate: option.slotDate,
              startTime: option.startTime,
              endTime: option.endTime,
            }))
        : [];

    let scheduleConfig: ScheduleConfig =
      playoffsPhysicalSelections.length > 0
        ? {
            days: [],
            matchDuration,
            courtIds: Array.from(
              new Set(playoffsPhysicalSelections.map((s) => s.courtId))
            ),
            selectedPhysicalSlots: playoffsPhysicalSelections,
          }
        : { days: scheduleDays, matchDuration, courtIds: selectedCourtIds };

    if (showLogs && (tournamentId || globalScheduleReview)) {
      setIsProcessing(true);
      setLogs([]);
      setProgress(0);
      setStatus("Iniciando...");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const effectiveUseRestrictionsAlgorithm =
        useRestrictionsAlgorithm ||
        globalScheduleReview ||
        (showOverlapTournamentSelector &&
          selectedOverlapTournamentIds.length > 0);

      const selectedPhysicalSlotsGlobal: PhysicalSlotSelection[] = globalScheduleReview
        ? physicalSlotOptionsSingle
            .filter((option) => selectedPhysicalSlotKeys.includes(option.key))
            .map((option) => ({
              slotDate: option.slotDate,
              startTime: option.startTime,
              endTime: option.endTime,
              courtId: option.courtId,
            }))
        : [];

      const selectedPhysicalSlotsSingleTournament = !globalScheduleReview
        ? physicalSlotOptionsSingle
            .filter((option) => selectedPhysicalSlotKeys.includes(option.key))
            .map((option) => ({
              tournamentGroupSlotId: option.tournamentGroupSlotId,
              courtId: option.courtId,
            }))
        : [];

      const derivedCourtIds = globalScheduleReview
        ? Array.from(new Set(selectedPhysicalSlotsGlobal.map((s) => s.courtId)))
        : selectedPhysicalSlotsSingleTournament.length > 0
          ? Array.from(new Set(selectedPhysicalSlotsSingleTournament.map((s) => s.courtId)))
          : selectedCourtIds;

      const body = useSlotMode
        ? {
            ...(globalScheduleReview
              ? {}
              : selectedPhysicalSlotsSingleTournament.length > 0
                ? { selectedPhysicalSlots: selectedPhysicalSlotsSingleTournament }
                : { slotIds: selectedSlotIds }),
            matchDuration,
            courtIds: derivedCourtIds,
            algorithm: effectiveUseRestrictionsAlgorithm
              ? "with-restrictions"
              : "default",
            ...(globalScheduleReview
              ? { selectedPhysicalSlots: selectedPhysicalSlotsGlobal }
              : {}),
            ...(showOverlapTournamentSelector && selectedOverlapTournamentIds.length > 0
              ? { overlapTournamentIds: selectedOverlapTournamentIds }
              : {}),
          }
        : { days: scheduleDays, matchDuration, courtIds: selectedCourtIds };

      const streamUrl = globalScheduleReview
        ? "/api/tournaments/schedule-review/regenerate-stream"
        : `/api/tournaments/${tournamentId}/${streamEndpoint}`;

      fetch(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Error al iniciar el proceso");
          }
          
          // Leer el stream
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          if (!reader) {
            throw new Error("No se pudo leer el stream");
          }
          
          let buffer = "";
          
          const readStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                  setIsProcessing(false);
                  abortControllerRef.current = null;
                  break;
                }
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                
                // Mantener la última línea incompleta en el buffer
                buffer = lines.pop() || "";
                
                for (const line of lines) {
                  if (line.trim() && line.startsWith("data: ")) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      
                      if (data.type === "log") {
                        setLogs((prev) => [...prev, { message: data.message, timestamp: new Date() }]);
                      } else if (data.type === "progress") {
                        setProgress(data.progress);
                        setStatus(data.status);
                      } else if (data.type === "error") {
                        setLogs((prev) => [...prev, { message: `❌ Error: ${data.error}`, timestamp: new Date() }]);
                        setIsProcessing(false);
                        alert(data.error);
                        return;
                      } else if (data.type === "success") {
                        setLogs((prev) => {
                          const finalLogs = [...prev, { message: "✅ Proceso completado exitosamente", timestamp: new Date() }];
                          // Guardar logs en sessionStorage para persistir entre re-renders
                          if (typeof window !== 'undefined' && storageKey) {
                            const savedLogsKey = `${storageKey}-logs`;
                            sessionStorage.setItem(savedLogsKey, JSON.stringify(finalLogs));
                          }
                          return finalLogs;
                        });
                        setIsProcessing(false);
                        setIsCompleted(true);
                        isCompletedRef.current = true; // Marcar como completado en la referencia también
                        setIsLogsExpanded(true); // Expandir logs automáticamente al completar
                        abortControllerRef.current = null;
                        // Guardar estado de completado en sessionStorage para persistir entre re-renders
                        if (typeof window !== 'undefined' && storageKey) {
                          sessionStorage.setItem(storageKey, 'true');
                        }
                        // Scroll al final de los logs
                        setTimeout(() => {
                          logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
                        }, 100);
                        // No cerrar el dialog ni recargar la página
                        // Solo llamar a onConfirm para que el componente padre actualice los datos si es necesario
                        onConfirm(scheduleConfig);
                        return;
                      }
                    } catch (e) {
                      console.error("Error parsing SSE data:", e, line);
                    }
                  }
                }
              }
            } catch (error: any) {
              // Si es un error de abort, no mostrar alerta
              if (error.name === 'AbortError') {
                setLogs((prev) => [...prev, { message: "⚠️ Proceso cancelado por el usuario", timestamp: new Date() }]);
                setIsProcessing(false);
                return;
              }
              console.error("Error reading stream:", error);
              setLogs((prev) => [...prev, { message: `❌ Error: ${error.message}`, timestamp: new Date() }]);
              setIsProcessing(false);
              alert(error.message || "Error al procesar");
            }
          };
          
          readStream();
        })
        .catch((error) => {
          // Si es un error de abort, no mostrar alerta
          if (error.name === 'AbortError') {
            setLogs((prev) => [...prev, { message: "⚠️ Proceso cancelado por el usuario", timestamp: new Date() }]);
            setIsProcessing(false);
            return;
          }
          console.error("Error:", error);
          setLogs((prev) => [...prev, { message: `❌ Error: ${error.message}`, timestamp: new Date() }]);
          setIsProcessing(false);
          alert(error.message || "Error al procesar");
        });
    } else {
      // Comportamiento original sin logs
      onConfirm(scheduleConfig);
    }
  };

  const toggleCourt = (courtId: number) => {
    setSelectedCourtIds((prev) =>
      prev.includes(courtId)
        ? prev.filter((id) => id !== courtId)
        : [...prev, courtId]
    );
  };

  const toggleSlot = (slotId: number) => {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  };

  const togglePhysicalSlot = (key: string) => {
    setSelectedPhysicalSlotKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllSlotsForCourt = (courtId: number) => {
    setSelectedPhysicalSlotKeys((prev) => {
      const keysForCourt = physicalSlotOptionsSingle
        .filter((o) => o.courtId === courtId)
        .map((o) => o.key);
      const next = new Set(prev);
      for (let i = 0; i < keysForCourt.length; i++) next.add(keysForCourt[i]);
      return Array.from(next);
    });
  };

  const deselectAllSlotsForCourt = (courtId: number) => {
    setSelectedPhysicalSlotKeys((prev) => {
      const keysForCourt = new Set(
        physicalSlotOptionsSingle.filter((o) => o.courtId === courtId).map((o) => o.key)
      );
      return prev.filter((k) => !keysForCourt.has(k));
    });
  };

  const toggleOverlapTournament = (tournamentIdToToggle: number) => {
    setSelectedOverlapTournamentIds((prev) =>
      prev.includes(tournamentIdToToggle)
        ? prev.filter((id) => id !== tournamentIdToToggle)
        : [...prev, tournamentIdToToggle]
    );
  };

  const timeToMinutes = (timeStr: string): number => {
    const s = String(timeStr).trim().substring(0, 5);
    const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };

  const calculateAvailableSlots = (): number => {
    if (useSlotMode && physicalSlotOptionsSingle.length > 0) {
      const selectedKeySet = new Set(selectedPhysicalSlotKeys);
      if (playoffsCalendarPick) {
        return physicalSlotOptionsSingle.filter((o) =>
          selectedKeySet.has(o.key)
        ).length;
      }
      let total = 0;
      for (const option of physicalSlotOptionsSingle) {
        if (!selectedKeySet.has(option.key)) continue;
        const startM = timeToMinutes(option.startTime);
        let endM = timeToMinutes(option.endTime);
        if (endM <= startM) endM += 24 * 60;
        const durationMinutes = endM - startM;
        total += Math.floor(durationMinutes / matchDuration);
      }
      return total;
    }

    const numCourts = selectedCourtIds.length;
    if (numCourts === 0) return 0;

    if (useSlotMode && groupSlots && groupSlots.length > 0) {
      const selected = groupSlots.filter((s) => selectedSlotIds.includes(s.id));
      let total = 0;
      for (const slot of selected) {
        const startM = timeToMinutes(slot.start_time);
        let endM = timeToMinutes(slot.end_time);
        if (endM <= startM) endM += 24 * 60;
        const durationMinutes = endM - startM;
        total += Math.floor(durationMinutes / matchDuration) * numCourts;
      }
      return total;
    }

    let totalSlots = 0;
    days.forEach((day) => {
      const [startH, startM] = day.startTime.split(":").map(Number);
      const [endH, endM] = day.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = (endH === 0 && endM === 0) ? 24 * 60 : endH * 60 + endM;
      const durationMinutes = endMinutes - startMinutes;
      totalSlots += Math.floor(durationMinutes / matchDuration) * numCourts;
    });
    return totalSlots;
  };

  const availableSlots = calculateAvailableSlots();
  const canConfirmSlotMode = Boolean(
    useSlotMode &&
      physicalSlotOptionsSingle.length > 0 &&
      selectedPhysicalSlotKeys.length > 0 &&
      (playoffsCalendarPick || (groupSlots && groupSlots.length > 0))
  );
  const canConfirmDaysMode = !useSlotMode && days.length > 0 && days.every((d) => d.date);
  /** Slots físicos solo aplican con stream (useSlotMode). Modo días (ej. generar playoffs) no usa selectedPhysicalSlotKeys. */
  const courtsAndPhysicalSelectionOk = useSlotMode
    ? selectedCourtIds.length > 0 && selectedPhysicalSlotKeys.length > 0
    : selectedCourtIds.length > 0;
  const playoffDaysChosenOk =
    !playoffsCalendarPick ||
    (days.some((d) => d.date) &&
      days.every((d) => {
        if (!d.date) return true;
        const [startH, startM] = d.startTime.split(":").map(Number);
        const [endH, endM] = d.endTime.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH === 0 && endM === 0 ? 24 * 60 : endH * 60 + endM;
        return startMinutes < endMinutes;
      }));

  const canConfirm =
    (useSlotMode ? canConfirmSlotMode : canConfirmDaysMode) &&
    courtsAndPhysicalSelectionOk &&
    playoffDaysChosenOk &&
    availableSlots >= effectiveMatchCount &&
    !loadingCourts &&
    !loadingSlots &&
    (!showLogs || !useSlotMode || effectiveMatchCount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {globalScheduleReview
              ? "Generar horarios en conjunto (revisión global)"
              : globalPlayoffsReady
                ? "Generar playoffs en conjunto"
                : playoffsCalendarPick
                  ? "Configurar horarios de playoffs"
                  : "Configurar horarios de partidos"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
              <Label>Canchas a usar</Label>
              {loadingCourts ? (
                <p className="text-sm text-muted-foreground">Cargando canchas...</p>
              ) : !Array.isArray(courts) || courts.length === 0 ? (
                <p className="text-sm text-red-600">
                  No hay canchas activas. Creá al menos una cancha primero.
                </p>
              ) : (
                <div className="space-y-2">
                  {courts.map((court) => (
                    <div key={court.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`court-${court.id}`}
                        checked={selectedCourtIds.includes(court.id)}
                        onCheckedChange={() => toggleCourt(court.id)}
                      />
                      <Label
                        htmlFor={`court-${court.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {court.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

          {playoffsCalendarPick && (
            <div className="space-y-2">
              <Label>Días de playoff</Label>
              <p className="text-xs text-muted-foreground">
                Definí las fechas y el horario de cada día de eliminatoria. Son independientes de los días de la
                fase de grupos.
              </p>
              <ScheduleDaysEditor
                days={days}
                onChange={handleDaysChange}
                showDayOfWeek={false}
              />
            </div>
          )}

          {/* Grilla de playoffs: solo duración de eliminatoria; regenerar zona: solo match_duration */}
          <div className="space-y-2">
            <Label>Duración estimada de partidos (minutos)</Label>
            <Input
              type="number"
              min="30"
              step="15"
              value={matchDuration}
              onChange={(e) => setMatchDuration(Number(e.target.value))}
            />
            {tournamentMatchDurationQuartersOnwards !== undefined && (
              <p className="text-xs text-muted-foreground">
                Zona (grupos): {tournamentMatchDuration} min · Playoffs (16avos, octavos, cuartos, etc.):{" "}
                {tournamentMatchDurationQuartersOnwards} min. Esta grilla usa{" "}
                {tournamentMatchDurationQuartersOnwards} min por partido de playoff.
              </p>
            )}
          </div>

          {/* Slots del torneo (misma fuente que las restricciones) o días libres */}
          {useSlotMode ? (
            <div className="space-y-3">
              <Label>
                {playoffsCalendarPick
                  ? "Horarios por cancha (días de playoff)"
                  : globalScheduleReview
                    ? "Slots por cancha (torneos en revisión)"
                    : "Slots del torneo por cancha"}
              </Label>
              {loadingSlots && !playoffsCalendarPick ? (
                <p className="text-sm text-muted-foreground">
                  {globalScheduleReview
                    ? "Cargando slots combinados..."
                    : "Cargando slots del torneo..."}
                </p>
              ) : !playoffsCalendarPick && (!groupSlots || groupSlots.length === 0) ? (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {globalScheduleReview ? (
                      <>
                        No hay slots en ningún torneo en revisión. Generá los horarios en{" "}
                        <strong>Equipos → Generar horarios</strong> en cada torneo y volvé acá.
                      </>
                    ) : (
                      <>
                        No hay slots del torneo. Generá los horarios en{" "}
                        <strong>Equipos → Generar horarios</strong> y luego volvé acá.
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-4 border rounded-md p-2">
                  {playoffsCalendarPick && !days.some((d) => d.date) ? (
                    <p className="text-sm text-muted-foreground px-1">
                      Definí al menos un día de playoff arriba para ver los horarios por cancha.
                    </p>
                  ) : physicalSlotOptionsSingle.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-1">
                      Marcá al menos una cancha arriba para ver los horarios disponibles por cancha.
                    </p>
                  ) : (
                    courts
                      .filter((c) => selectedCourtIds.includes(c.id))
                      .sort((a, b) => a.name.localeCompare(b.name, "es"))
                      .map((court) => (
                        <div key={court.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-2 border-b pb-1">
                            <p className="text-sm font-medium min-w-0 truncate">{court.name}</p>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => selectAllSlotsForCourt(court.id)}
                              >
                                Todos
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => deselectAllSlotsForCourt(court.id)}
                              >
                                Ninguno
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1 pl-1">
                            {physicalSlotOptionsSingle
                              .filter((o) => o.courtId === court.id)
                              .map((option) => {
                                const checked = selectedPhysicalSlotKeys.includes(option.key);
                                return (
                                  <div key={option.key} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`physical-slot-single-${option.key}`}
                                      checked={checked}
                                      onCheckedChange={() => togglePhysicalSlot(option.key)}
                                    />
                                    <Label
                                      htmlFor={`physical-slot-single-${option.key}`}
                                      className="text-sm font-normal cursor-pointer flex-1"
                                    >
                                      {option.label}
                                    </Label>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
              {!playoffsCalendarPick && (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="use-restrictions"
                    checked={useRestrictionsAlgorithm}
                    onCheckedChange={(v) => setUseRestrictionsAlgorithm(Boolean(v))}
                  />
                  <Label htmlFor="use-restrictions" className="text-sm font-normal cursor-pointer">
                    Usar restricciones horarias de los equipos (asignar respetando disponibilidad)
                  </Label>
                </div>
              )}
              {playoffsCalendarPick && (
                <p className="text-xs text-muted-foreground pt-2">
                  {globalPlayoffsReady
                    ? "Marcá qué ventanas y canchas usar para todos los torneos listos. Los partidos se asignan en orden a los huecos elegidos."
                    : "Marcá qué ventanas y canchas usar para los playoffs. Las restricciones horarias de equipos no se aplican en este paso."}
                </p>
              )}
              {useSlotMode &&
                !playoffsCalendarPick &&
                groupSlots &&
                groupSlots.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {globalScheduleReview
                    ? "Elegí canchas y ventanas horarias compartidas para todos los torneos en revisión (misma definición que en restricciones de equipos)."
                    : "Elegí en qué cancha puede usarse cada ventana horaria del torneo (misma definición que en restricciones de equipos)."}
                </p>
              )}

              {showOverlapTournamentSelector && (
                <div className="space-y-2 pt-2 border-t">
                  <Label>Torneos solapados (compartir canchas/slots)</Label>
                  <p className="text-xs text-muted-foreground">
                    Seleccioná torneos que usan los mismos días/canchas. Sus partidos de grupos pendientes se regeneran junto con este torneo en una única corrida.
                  </p>
                  {loadingOverlapTournaments ? (
                    <p className="text-sm text-muted-foreground">Cargando torneos...</p>
                  ) : overlapTournaments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay otros torneos activos para solapar.
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-2 border rounded-md p-2">
                      {overlapTournaments.map((otherTournament) => (
                        <div key={otherTournament.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`overlap-tournament-${otherTournament.id}`}
                            checked={selectedOverlapTournamentIds.includes(otherTournament.id)}
                            onCheckedChange={() => toggleOverlapTournament(otherTournament.id)}
                          />
                          <Label
                            htmlFor={`overlap-tournament-${otherTournament.id}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {otherTournament.name}{" "}
                            <span className="text-xs text-muted-foreground">
                              ({otherTournament.status})
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedOverlapTournamentIds.length > 0 && (
                    <p className="text-xs text-amber-700">
                      Se regenerarán horarios de grupos en conjunto para {selectedOverlapTournamentIds.length + 1} torneo(s).
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Días disponibles</Label>
              <ScheduleDaysEditor
                days={days}
                onChange={handleDaysChange}
                showDayOfWeek={false}
              />
            </div>
          )}

          {/* Resumen y vista previa de slots */}
          <div className="bg-muted p-3 rounded-lg space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Partidos a programar: <span className="font-bold">{effectiveMatchCount}</span>
              </p>
              {useSlotMode && selectedPhysicalSlotKeys.length > 0 && (
                <p className="text-sm">
                  Combinaciones horario + cancha:{" "}
                  <span className="font-bold">{selectedPhysicalSlotKeys.length}</span>
                </p>
              )}
              <p className="text-sm">
                Slots disponibles: <span className="font-bold">{availableSlots}</span>
              </p>
              {availableSlots < effectiveMatchCount && (
                <p className="text-xs text-red-600 font-medium">
                  ⚠️ No hay suficientes slots.{" "}
                  {useSlotMode
                    ? "Seleccioná más slots del torneo o revisá la duración del partido."
                    : "Agregá más días u horarios."}
                </p>
              )}
            </div>

            {/* Vista previa de slots generados (solo en modo días libres) */}
            {!useSlotMode && selectedCourtIds.length > 0 && days.some((d) => d.date) && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium mb-2">Vista previa de slots generados:</p>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {days
                    .filter((d) => d.date)
                    .map((day, dayIndex) => {
                      const [startH, startM] = day.startTime.split(":").map(Number);
                      const [endH, endM] = day.endTime.split(":").map(Number);
                      const startMinutes = startH * 60 + startM;
                      // Si la hora de fin es 00:00, interpretarla como 24:00 (fin del día)
                      const endMinutes = (endH === 0 && endM === 0) ? 24 * 60 : endH * 60 + endM;

                      // Generar slots para este día
                      const slotsForDay: Array<{ time: string; courtName: string; endTime: string }> = [];
                      let currentMinutes = startMinutes;

                      while (currentMinutes + matchDuration <= endMinutes) {
                        const slotStartH = Math.floor(currentMinutes / 60);
                        const slotStartM = currentMinutes % 60;
                        const slotEndMinutes = currentMinutes + matchDuration;
                        
                        // Calcular hora de fin del slot
                        let slotEndH: number;
                        let slotEndM: number;
                        if (slotEndMinutes >= 24 * 60) {
                          slotEndH = 0;
                          slotEndM = 0;
                        } else {
                          slotEndH = Math.floor(slotEndMinutes / 60);
                          slotEndM = slotEndMinutes % 60;
                        }
                        
                        const slotStartTime = `${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}`;
                        const slotEndTime = `${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}`;

                        // Un slot por cada cancha seleccionada
                        selectedCourtIds.forEach((courtId) => {
                          const court = courts.find((c) => c.id === courtId);
                          slotsForDay.push({
                            time: slotStartTime,
                            endTime: slotEndTime,
                            courtName: court?.name || `Cancha ${courtId}`,
                          });
                        });

                        currentMinutes += matchDuration;
                      }

                      // Crear fecha en zona horaria local para evitar problemas de UTC
                      const [year, month, dayOfMonth] = day.date.split("-").map(Number);
                      const localDate = new Date(year, month - 1, dayOfMonth);

                      return (
                        <div key={dayIndex} className="space-y-1">
                          <div className="text-xs font-semibold">
                            {localDate.toLocaleDateString("es-AR", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            {slotsForDay.map((slot, idx) => (
                              <div
                                key={idx}
                                className="bg-background px-2 py-1 rounded border text-muted-foreground"
                              >
                                {slot.time} - {slot.endTime} - {slot.courtName}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
          
          {/* Mostrar error dentro del dialog */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive font-medium">
                {error}
              </p>
            </div>
          )}

          {/* Bitácora de logs (solo si showLogs es true) */}
          {showLogs && (isProcessing || logs.length > 0 || isCompleted) && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bitácora del proceso</Label>
                {!isCompleted && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                    className="h-6 px-2 text-xs"
                  >
                    {isLogsExpanded ? "Ocultar" : "Mostrar"}
                  </Button>
                )}
              </div>
              {status && !isCompleted && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground min-w-[120px]">{status}</span>
                </div>
              )}
              {(isLogsExpanded || isCompleted) && (
                <div className="bg-muted rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
                  {logs.length === 0 && isProcessing && (
                    <div className="text-muted-foreground">Esperando logs...</div>
                  )}
                  {logs.map((log, idx) => {
                    // Asegurar que timestamp sea un Date
                    const timestamp = log.timestamp instanceof Date 
                      ? log.timestamp 
                      : typeof log.timestamp === 'string' 
                        ? new Date(log.timestamp) 
                        : new Date();
                    return (
                      <div key={idx} className="text-foreground flex items-start gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timestamp.toLocaleTimeString("es-AR", { 
                            hour: "2-digit", 
                            minute: "2-digit", 
                            second: "2-digit",
                            fractionalSecondDigits: 3
                          })}
                        </span>
                        <span>{log.message}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {isProcessing ? (
            <Button 
              variant="destructive" 
              onClick={handleCancel}
            >
              Cancelar proceso
            </Button>
          ) : isCompleted ? (
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          ) : (
            <>
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm || isProcessing || isLoading}
              >
                {isLoading || isProcessing
                  ? globalScheduleReview
                    ? "Generando horarios en conjunto..."
                    : streamEndpoint === "regenerate-schedule-stream"
                      ? "Regenerando horarios de zona..."
                      : "Generando playoffs..."
                  : "Confirmar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

