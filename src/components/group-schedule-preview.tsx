"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2Icon,
  PencilIcon,
  CheckIcon,
  XIcon,
  CalendarClockIcon,
  ArrowLeftRightIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { formatDate, formatTimeRange, resolveMatchEndTime } from "@/lib/date-utils";
import { toHHMM } from "@/lib/build-schedule-days-from-slots";
import type { GroupDTO, MatchDTO } from "@/models/dto/tournament";
import type { CourtDTO } from "@/models/dto/court";
import { tournamentMatchesService, tournamentsService } from "@/services";
import { cn } from "@/lib/utils";

export type GroupSchedulePreviewTournament = {
  id: number;
  name: string;
  status: string;
  match_duration: number | null;
  groups: GroupDTO[];
  matches: MatchDTO[];
  tournamentGroupSlots?: Array<{
    id: number;
    slot_date: string;
    start_time: string;
    end_time: string | null;
  }>;
  groupScheduleCourtIds: number[];
};

type FlatMatch = {
  key: string;
  tournamentId: number;
  tournamentName: string;
  groupName: string;
  matchDuration: number;
  match: MatchDTO;
};

type ScheduleRow =
  | {
      key: string;
      type: "match";
      flat: FlatMatch;
    }
  | {
      key: string;
      type: "free";
      slotDate: string;
      startTime: string;
      endTime: string | null;
      courtId: number;
    };

const TOURNAMENT_ROW_PALETTE = [
  {
    row: "bg-blue-50/90 hover:bg-blue-100/70 dark:bg-blue-950/40",
    border: "border-l-blue-400 dark:border-l-blue-500",
    label: "text-blue-900 dark:text-blue-100",
    swatch: "bg-blue-300",
  },
  {
    row: "bg-emerald-50/90 hover:bg-emerald-100/70 dark:bg-emerald-950/40",
    border: "border-l-emerald-500 dark:border-l-emerald-400",
    label: "text-emerald-900 dark:text-emerald-100",
    swatch: "bg-emerald-300",
  },
  {
    row: "bg-amber-50/90 hover:bg-amber-100/70 dark:bg-amber-950/40",
    border: "border-l-amber-500 dark:border-l-amber-400",
    label: "text-amber-900 dark:text-amber-100",
    swatch: "bg-amber-300",
  },
  {
    row: "bg-violet-50/90 hover:bg-violet-100/70 dark:bg-violet-950/40",
    border: "border-l-violet-500 dark:border-l-violet-400",
    label: "text-violet-900 dark:text-violet-100",
    swatch: "bg-violet-300",
  },
  {
    row: "bg-rose-50/90 hover:bg-rose-100/70 dark:bg-rose-950/40",
    border: "border-l-rose-500 dark:border-l-rose-400",
    label: "text-rose-900 dark:text-rose-100",
    swatch: "bg-rose-300",
  },
  {
    row: "bg-cyan-50/90 hover:bg-cyan-100/70 dark:bg-cyan-950/40",
    border: "border-l-cyan-500 dark:border-l-cyan-400",
    label: "text-cyan-900 dark:text-cyan-100",
    swatch: "bg-cyan-300",
  },
] as const;

function teamLabel(team: MatchDTO["team1"]) {
  if (!team) return "—";
  if (team.display_name?.trim()) return team.display_name.trim();
  const p1 = `${team.player1?.last_name ?? ""}`.trim();
  const p2 = `${team.player2?.last_name ?? ""}`.trim();
  if (!p1 && !p2) return "—";
  return `${p1} / ${p2}`.replace(/^\/\s*|\s*\/\s*$/g, "").trim();
}

function matchSortKey(row: ScheduleRow): string {
  if (row.type === "free") {
    const court = String(row.courtId).padStart(6, "0");
    return `${row.slotDate}|${toHHMM(row.startTime)}|${court}|free`;
  }
  const m = row.flat.match;
  const date = m.match_date?.split("T")[0] ?? "9999-12-31";
  const time = m.start_time ?? "99:99";
  const court = String(m.court_id ?? 9999).padStart(6, "0");
  return `${date}|${time}|${court}|${row.flat.tournamentId}|${row.flat.groupName}`;
}

function buildGlobalScheduleRows(
  tournaments: GroupSchedulePreviewTournament[]
): ScheduleRow[] {
  const groupNameById = new Map<number, string>();
  for (const t of tournaments) {
    for (const g of t.groups) {
      groupNameById.set(g.id, g.name);
    }
  }

  const flatMatches: FlatMatch[] = [];
  for (const t of tournaments) {
    const duration = Math.max(30, Number(t.match_duration) || 60);
    for (const match of t.matches) {
      if (!match.match_date || !match.start_time) continue;
      flatMatches.push({
        key: `match-${match.id}`,
        tournamentId: t.id,
        tournamentName: t.name,
        groupName: match.tournament_group_id
          ? groupNameById.get(match.tournament_group_id) ?? "Zona"
          : "Zona",
        matchDuration: duration,
        match,
      });
    }
  }

  const rows: ScheduleRow[] = flatMatches.map((flat) => ({
    key: flat.key,
    type: "match" as const,
    flat,
  }));

  const slotWindows = new Map<
    string,
    { slotDate: string; startTime: string; endTime: string | null }
  >();
  for (const t of tournaments) {
    for (const slot of t.tournamentGroupSlots ?? []) {
      const d = String(slot.slot_date).trim().slice(0, 10);
      const key = `${d}\t${toHHMM(slot.start_time)}\t${toHHMM(slot.end_time ?? "")}`;
      if (!slotWindows.has(key)) {
        slotWindows.set(key, {
          slotDate: d,
          startTime: slot.start_time,
          endTime: slot.end_time ?? null,
        });
      }
    }
  }

  const courtIds = new Set<number>();
  for (const t of tournaments) {
    for (const id of t.groupScheduleCourtIds ?? []) {
      if (Number.isFinite(id)) courtIds.add(id);
    }
    for (const m of t.matches) {
      if (m.court_id != null) courtIds.add(m.court_id);
    }
  }
  const sortedCourts = Array.from(courtIds).sort((a, b) => a - b);

  if (sortedCourts.length > 0 && slotWindows.size > 0) {
    const occupiedRemaining = new Map<string, number>();
    for (const flat of flatMatches) {
      const m = flat.match;
      if (m.court_id == null || !m.match_date || !m.start_time) continue;
      const d = String(m.match_date).trim().slice(0, 10);
      const cellKey = `${d}\t${toHHMM(m.start_time)}\t${m.court_id}`;
      occupiedRemaining.set(cellKey, (occupiedRemaining.get(cellKey) ?? 0) + 1);
    }

    const unassignedRemaining = new Map<string, number>();
    for (const flat of flatMatches) {
      const m = flat.match;
      if (m.court_id != null || !m.match_date || !m.start_time) continue;
      const d = String(m.match_date).trim().slice(0, 10);
      const dtKey = `${d}\t${toHHMM(m.start_time)}`;
      unassignedRemaining.set(dtKey, (unassignedRemaining.get(dtKey) ?? 0) + 1);
    }

    let freeIdx = 0;
    for (const slot of Array.from(slotWindows.values())) {
      const d = slot.slotDate;
      const tNorm = toHHMM(slot.startTime);
      const dtKey = `${d}\t${tNorm}`;
      for (const courtId of sortedCourts) {
        const cellKey = `${d}\t${tNorm}\t${courtId}`;
        const rem = occupiedRemaining.get(cellKey) ?? 0;
        if (rem > 0) {
          occupiedRemaining.set(cellKey, rem - 1);
        } else {
          const u = unassignedRemaining.get(dtKey) ?? 0;
          if (u > 0) {
            unassignedRemaining.set(dtKey, u - 1);
          } else {
            rows.push({
              key: `free-${cellKey}-${freeIdx++}`,
              type: "free",
              slotDate: d,
              startTime: slot.startTime,
              endTime: slot.endTime,
              courtId,
            });
          }
        }
      }
    }
  }

  return rows.sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
}

type GroupSchedulePreviewProps = {
  tournamentIds?: number[];
  readOnly?: boolean;
  title?: string;
  description?: string;
  compact?: boolean;
};

async function fetchPreview(tournamentIds?: number[]) {
  const qs =
    tournamentIds && tournamentIds.length > 0
      ? `?ids=${tournamentIds.join(",")}`
      : "";
  return tournamentsService.getGroupsSchedulePreview(qs);
}

export function GroupSchedulePreview({
  tournamentIds,
  readOnly = false,
  title = "Revisión conjunta de horarios",
  description = "Todos los partidos de zona en un solo cronograma. Un slot de cancha no puede usarse dos veces.",
  compact = false,
}: GroupSchedulePreviewProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"timeline" | "tournament">("timeline");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editCourtId, setEditCourtId] = useState("none");
  const [saving, setSaving] = useState(false);
  const [selectedRow1, setSelectedRow1] = useState<string | null>(null);
  const [selectedRow2, setSelectedRow2] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  const queryKey = [
    "groups-schedule-preview",
    tournamentIds?.join(",") ?? "all",
  ] as const;

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchPreview(tournamentIds),
    staleTime: 1000 * 15,
  });

  const { data: courts = [] } = useQuery<CourtDTO[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const response = await fetch("/api/courts?onlyActive=true");
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const courtMap = useMemo(
    () => new Map(courts.map((c) => [c.id, c.name])),
    [courts]
  );

  const tournamentList = useMemo(
    () =>
      (data?.tournaments ?? []).map((t) => ({
        ...t,
        tournamentGroupSlots: t.tournamentGroupSlots ?? [],
      })),
    [data?.tournaments]
  );

  const scheduleRows = useMemo(
    () => buildGlobalScheduleRows(tournamentList),
    [tournamentList]
  );

  const flatMatches = useMemo(
    () =>
      scheduleRows
        .filter((r): r is Extract<ScheduleRow, { type: "match" }> => r.type === "match")
        .map((r) => r.flat),
    [scheduleRows]
  );

  const groupedByTournament = useMemo(() => {
    const map = new Map<string, FlatMatch[]>();
    for (const m of flatMatches) {
      const list = map.get(m.tournamentName) ?? [];
      list.push(m);
      map.set(m.tournamentName, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [flatMatches]);

  const tournamentColorById = useMemo(() => {
    const sorted = [...tournamentList].sort((a, b) => a.id - b.id);
    const map = new Map<number, (typeof TOURNAMENT_ROW_PALETTE)[number]>();
    sorted.forEach((t, index) => {
      map.set(t.id, TOURNAMENT_ROW_PALETTE[index % TOURNAMENT_ROW_PALETTE.length]);
    });
    return map;
  }, [tournamentList]);

  const conflictCellKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flat of flatMatches) {
      const m = flat.match;
      if (!m.match_date || !m.start_time || m.court_id == null) continue;
      const d = String(m.match_date).trim().slice(0, 10);
      const key = `${d}\t${toHHMM(m.start_time)}\t${m.court_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    );
  }, [flatMatches]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["groups-schedule-preview"] });
    void queryClient.invalidateQueries({ queryKey: ["tournament-groups"] });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditDate("");
    setEditTime("");
    setEditEndTime("");
    setEditCourtId("none");
  };

  const clearSelection = () => {
    setSelectedRow1(null);
    setSelectedRow2(null);
  };

  const toggleRowSelection = (key: string) => {
    if (readOnly || swapping || editingKey) return;
    if (selectedRow1 === key) {
      setSelectedRow1(null);
      return;
    }
    if (selectedRow2 === key) {
      setSelectedRow2(null);
      return;
    }
    if (!selectedRow1) {
      setSelectedRow1(key);
      return;
    }
    if (!selectedRow2) {
      setSelectedRow2(key);
      return;
    }
    setSelectedRow1(key);
    setSelectedRow2(null);
  };

  const handleSwapOrMove = async () => {
    if (!selectedRow1 || !selectedRow2) return;

    const row1 = scheduleRows.find((r) => r.key === selectedRow1);
    const row2 = scheduleRows.find((r) => r.key === selectedRow2);
    if (!row1 || !row2) return;

    const matchRows = [row1, row2].filter(
      (r): r is Extract<ScheduleRow, { type: "match" }> => r.type === "match"
    );
    const freeRows = [row1, row2].filter(
      (r): r is Extract<ScheduleRow, { type: "free" }> => r.type === "free"
    );

    if (matchRows.length === 0) {
      alert("Seleccioná al menos un partido para mover o intercambiar");
      return;
    }

    try {
      setSwapping(true);

      if (matchRows.length === 2) {
        const m1 = matchRows[0].flat.match;
        const m2 = matchRows[1].flat.match;
        const d1 = matchRows[0].flat.matchDuration;
        const d2 = matchRows[1].flat.matchDuration;

        await Promise.all([
          tournamentMatchesService.scheduleMatch(m1.id, {
            date: m2.match_date!,
            start_time: m2.start_time!,
            end_time:
              m2.end_time?.trim() ||
              resolveMatchEndTime(m2.start_time!, null, d1) ||
              m2.start_time!,
            court_id: m2.court_id ?? undefined,
          }),
          tournamentMatchesService.scheduleMatch(m2.id, {
            date: m1.match_date!,
            start_time: m1.start_time!,
            end_time:
              m1.end_time?.trim() ||
              resolveMatchEndTime(m1.start_time!, null, d2) ||
              m1.start_time!,
            court_id: m1.court_id ?? undefined,
          }),
        ]);
      } else if (matchRows.length === 1 && freeRows.length === 1) {
        const match = matchRows[0].flat.match;
        const free = freeRows[0];
        const duration = matchRows[0].flat.matchDuration;

        await tournamentMatchesService.scheduleMatch(match.id, {
          date: free.slotDate,
          start_time: free.startTime,
          end_time:
            free.endTime?.trim() ||
            resolveMatchEndTime(free.startTime, null, duration) ||
            free.startTime,
          court_id: free.courtId,
        });
      } else {
        alert("Seleccioná dos partidos o un partido y un slot libre");
        return;
      }

      clearSelection();
      refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error al intercambiar horarios");
    } finally {
      setSwapping(false);
    }
  };

  const startEdit = (flat: FlatMatch) => {
    clearSelection();
    setEditingKey(flat.key);
    setEditDate(flat.match.match_date ? flat.match.match_date.split("T")[0] : "");
    setEditTime(flat.match.start_time ?? "");
    setEditEndTime(
      resolveMatchEndTime(
        flat.match.start_time ?? "",
        flat.match.end_time,
        flat.matchDuration
      ) || ""
    );
    setEditCourtId(
      flat.match.court_id ? String(flat.match.court_id) : "none"
    );
  };

  const saveEdit = async (flat: FlatMatch) => {
    if (!editDate || !editTime) {
      alert("Fecha y hora de inicio son requeridos");
      return;
    }
    if (editCourtId === "none") {
      alert("Elegí una cancha");
      return;
    }

    try {
      setSaving(true);
      const endTime =
        editEndTime.trim() ||
        resolveMatchEndTime(editTime, null, flat.matchDuration) ||
        editTime;
      await tournamentMatchesService.scheduleMatch(flat.match.id, {
        date: editDate,
        start_time: editTime,
        end_time: endTime,
        court_id: Number(editCourtId),
      });
      cancelEdit();
      refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error al actualizar horario");
    } finally {
      setSaving(false);
    }
  };

  const renderMatchRow = (
    flat: FlatMatch,
    showTournamentColumn: boolean
  ) => {
    const isEditing = editingKey === flat.key;
    const isSelected1 = selectedRow1 === flat.key;
    const isSelected2 = selectedRow2 === flat.key;
    const isSelected = isSelected1 || isSelected2;
    const tournamentColor = tournamentColorById.get(flat.tournamentId);
    const m = flat.match;

    const conflictKey =
      m.match_date && m.start_time && m.court_id != null
        ? `${String(m.match_date).trim().slice(0, 10)}\t${toHHMM(m.start_time)}\t${m.court_id}`
        : null;
    const hasConflict = conflictKey ? conflictCellKeys.has(conflictKey) : false;

    const label1 = teamLabel(m.team1);
    const label2 = teamLabel(m.team2);
    const vs =
      label1 !== "—" && label2 !== "—"
        ? `${label1} vs ${label2}`
        : label1 !== "—" || label2 !== "—"
          ? `${label1 !== "—" ? label1 : label2}`
          : "Por definir";

    return (
      <TableRow
        key={flat.key}
        className={cn(
          "border-l-4 transition-colors",
          tournamentColor?.row,
          tournamentColor?.border,
          !readOnly && "cursor-pointer",
          isSelected && "ring-2 ring-blue-400 ring-inset",
          hasConflict && "bg-red-50/80 dark:bg-red-950/30"
        )}
        onClick={() => {
          if (!readOnly && !isEditing) toggleRowSelection(flat.key);
        }}
      >
        {!readOnly && (
          <TableCell className="w-10 text-center">
            <input
              type="checkbox"
              checked={isSelected}
              readOnly
              className="pointer-events-none"
            />
          </TableCell>
        )}
        {showTournamentColumn && (
          <TableCell
            className={cn(
              "text-xs font-medium whitespace-nowrap",
              tournamentColor?.label
            )}
          >
            {flat.tournamentName}
          </TableCell>
        )}
        <TableCell className="whitespace-nowrap">
          <Badge variant="outline" className="text-[10px]">
            {flat.groupName}
          </Badge>
        </TableCell>
        <TableCell className="text-sm min-w-[160px]">{vs}</TableCell>
        {isEditing ? (
          <>
            <TableCell>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-8 text-xs w-[130px]"
                onClick={(e) => e.stopPropagation()}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="h-8 text-xs w-[100px]"
                  step="60"
                />
                <Input
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  className="h-8 text-xs w-[100px]"
                  step="60"
                />
              </div>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Select value={editCourtId} onValueChange={setEditCourtId}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
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
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={saving}
                  onClick={() => saveEdit(flat)}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={cancelEdit}>
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </>
        ) : (
          <>
            <TableCell className="text-xs whitespace-nowrap">
              {m.match_date ? formatDate(m.match_date) : "—"}
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap">
              {m.start_time
                ? formatTimeRange(
                    m.start_time,
                    resolveMatchEndTime(m.start_time, m.end_time, flat.matchDuration)
                  )
                : "—"}
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap">
              {m.court_id
                ? courtMap.get(m.court_id) ?? `Cancha ${m.court_id}`
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {hasConflict && (
                  <span title="Conflicto de cancha">
                    <AlertTriangleIcon className="h-3.5 w-3.5 text-red-600" />
                  </span>
                )}
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(flat);
                    }}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </TableCell>
          </>
        )}
      </TableRow>
    );
  };

  const renderFreeRow = (row: Extract<ScheduleRow, { type: "free" }>) => {
    const isSelected1 = selectedRow1 === row.key;
    const isSelected2 = selectedRow2 === row.key;
    const isSelected = isSelected1 || isSelected2;

    return (
      <TableRow
        key={row.key}
        className={cn(
          "bg-muted/30 text-muted-foreground italic",
          !readOnly && "cursor-pointer",
          isSelected && "ring-2 ring-blue-400 ring-inset"
        )}
        onClick={() => {
          if (!readOnly) toggleRowSelection(row.key);
        }}
      >
        {!readOnly && (
          <TableCell className="w-10 text-center">
            <input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" />
          </TableCell>
        )}
        {viewMode === "timeline" && <TableCell>—</TableCell>}
        <TableCell colSpan={2}>
          <span className="text-xs">Slot libre</span>
        </TableCell>
        <TableCell className="text-xs">{formatDate(row.slotDate)}</TableCell>
        <TableCell className="text-xs">
          {formatTimeRange(
            row.startTime,
            resolveMatchEndTime(row.startTime, row.endTime, 60)
          )}
        </TableCell>
        <TableCell className="text-xs">
          {courtMap.get(row.courtId) ?? `Cancha ${row.courtId}`}
        </TableCell>
        <TableCell />
      </TableRow>
    );
  };

  const renderTable = (rows: ScheduleRow[], showTournamentColumn: boolean) => (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {!readOnly && <TableHead className="w-10">Sel.</TableHead>}
            {showTournamentColumn && <TableHead>Torneo</TableHead>}
            <TableHead>Zona</TableHead>
            <TableHead>Partido</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Cancha</TableHead>
            <TableHead className="text-right w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showTournamentColumn ? 8 : 7}
                className="text-center text-muted-foreground py-8"
              >
                No hay partidos programados para mostrar
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) =>
              row.type === "match"
                ? renderMatchRow(row.flat, showTournamentColumn)
                : renderFreeRow(row)
            )
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (isLoading) {
    return (
      <div className="h-[160px] flex items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        No se pudo cargar la revisión conjunta de horarios.
      </p>
    );
  }

  if (tournamentList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay torneos en revisión de horarios con zonas generadas.
      </p>
    );
  }

  const conflictCount = conflictCellKeys.size;
  const freeSlotCount = scheduleRows.filter((r) => r.type === "free").length;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`font-semibold ${compact ? "text-base" : "text-lg"}`}>
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "timeline" ? "default" : "outline"}
            onClick={() => setViewMode("timeline")}
          >
            <CalendarClockIcon className="h-3.5 w-3.5 mr-1" />
            Por horario
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "tournament" ? "default" : "outline"}
            onClick={() => setViewMode("tournament")}
          >
            Por torneo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {flatMatches.length} partido(s) · {tournamentList.length} torneo(s)
        </span>
        {freeSlotCount > 0 && <span>· {freeSlotCount} slot(s) libre(s)</span>}
        {conflictCount > 0 && (
          <span className="text-red-600 font-medium flex items-center gap-1">
            <AlertTriangleIcon className="h-3.5 w-3.5" />
            {conflictCount} conflicto(s) de cancha
          </span>
        )}
        <div className="flex flex-wrap gap-2 ml-auto">
          {tournamentList.map((t) => {
            const color = tournamentColorById.get(t.id);
            return (
              <span key={t.id} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", color?.swatch)} />
                <span className={color?.label}>{t.name}</span>
              </span>
            );
          })}
        </div>
      </div>

      {!readOnly && (selectedRow1 || selectedRow2) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-900">
            {selectedRow1 && selectedRow2
              ? "2 elementos seleccionados — intercambiar partidos o mover uno a un slot libre"
              : "1 elemento seleccionado — elegí otro partido o slot libre"}
          </span>
          {selectedRow1 && selectedRow2 && (
            <>
              <Button
                size="sm"
                onClick={() => void handleSwapOrMove()}
                disabled={swapping}
                className="ml-auto"
              >
                {swapping ? (
                  <>
                    <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    <ArrowLeftRightIcon className="h-3 w-3 mr-1" />
                    Intercambiar / mover
                  </>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection} disabled={swapping}>
                <XIcon className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      )}

      {viewMode === "timeline" ? (
        renderTable(scheduleRows, true)
      ) : (
        <div className="space-y-6">
          {groupedByTournament.map(([name, matches]) => {
            const tournamentRows: ScheduleRow[] = scheduleRows.filter(
              (r) => r.type === "match" && r.flat.tournamentName === name
            );
            return (
              <div key={name} className="space-y-2">
                <h4 className="text-sm font-semibold">{name}</h4>
                {renderTable(
                  tournamentRows,
                  false
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
