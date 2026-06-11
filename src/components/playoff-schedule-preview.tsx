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
import { Loader2Icon, PencilIcon, CheckIcon, XIcon, CalendarClockIcon } from "lucide-react";
import { formatDate, formatTimeRange, resolveMatchEndTime } from "@/lib/date-utils";
import { playoffMatchDurationMinutes } from "@/lib/playoff-match-duration";
import type { PlayoffRow } from "@/models/dto/tournament";
import type { CourtDTO } from "@/models/dto/court";
import { tournamentMatchesService, tournamentsService } from "@/services";
import { cn } from "@/lib/utils";
import type { PlannedTournamentPreview } from "@/lib/plan-bulk-playoffs-preview";

export type PlayoffSchedulePreviewTournament = {
  id: number;
  name: string;
  status: string;
  match_duration: number | null;
  match_duration_quarters_onwards: number | null;
  rows: PlayoffRow[];
};

type FlatMatch = {
  key: string;
  tournamentId: number;
  tournamentName: string;
  playoffDuration: number;
  round: string;
  bracketPos: number;
  row?: PlayoffRow;
  match: NonNullable<PlayoffRow["match"]>;
  team1Display?: string;
  team2Display?: string;
};

const ROUND_ORDER: Record<string, number> = {
  "16avos": 1,
  octavos: 2,
  cuartos: 3,
  semifinal: 4,
  final: 5,
};

const ROUND_LABELS: Record<string, string> = {
  "16avos": "16avos",
  octavos: "Octavos",
  cuartos: "Cuartos",
  semifinal: "Semifinal",
  final: "Final",
};

const TOURNAMENT_ROW_PALETTE = [
  {
    row: "bg-blue-50/90 hover:bg-blue-100/70 dark:bg-blue-950/40 dark:hover:bg-blue-950/60",
    border: "border-l-blue-400 dark:border-l-blue-500",
    swatch: "bg-blue-300 dark:bg-blue-600",
    label: "text-blue-900 dark:text-blue-100",
  },
  {
    row: "bg-emerald-50/90 hover:bg-emerald-100/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60",
    border: "border-l-emerald-500 dark:border-l-emerald-400",
    swatch: "bg-emerald-300 dark:bg-emerald-600",
    label: "text-emerald-900 dark:text-emerald-100",
  },
  {
    row: "bg-amber-50/90 hover:bg-amber-100/70 dark:bg-amber-950/40 dark:hover:bg-amber-950/60",
    border: "border-l-amber-500 dark:border-l-amber-400",
    swatch: "bg-amber-300 dark:bg-amber-600",
    label: "text-amber-900 dark:text-amber-100",
  },
  {
    row: "bg-violet-50/90 hover:bg-violet-100/70 dark:bg-violet-950/40 dark:hover:bg-violet-950/60",
    border: "border-l-violet-500 dark:border-l-violet-400",
    swatch: "bg-violet-300 dark:bg-violet-600",
    label: "text-violet-900 dark:text-violet-100",
  },
  {
    row: "bg-rose-50/90 hover:bg-rose-100/70 dark:bg-rose-950/40 dark:hover:bg-rose-950/60",
    border: "border-l-rose-500 dark:border-l-rose-400",
    swatch: "bg-rose-300 dark:bg-rose-600",
    label: "text-rose-900 dark:text-rose-100",
  },
  {
    row: "bg-cyan-50/90 hover:bg-cyan-100/70 dark:bg-cyan-950/40 dark:hover:bg-cyan-950/60",
    border: "border-l-cyan-500 dark:border-l-cyan-400",
    swatch: "bg-cyan-300 dark:bg-cyan-600",
    label: "text-cyan-900 dark:text-cyan-100",
  },
] as const;

function teamLabel(team: FlatMatch["match"]["team1"]) {
  if (!team) return "—";
  if (team.display_name) return team.display_name;
  const p1 = `${team.player1?.last_name ?? ""}`.trim();
  const p2 = `${team.player2?.last_name ?? ""}`.trim();
  if (!p1 && !p2) return "—";
  return `${p1} / ${p2}`.replace(/^\/\s*|\s*\/\s*$/g, "").trim();
}

function matchSortKey(m: FlatMatch): string {
  const date = m.match.match_date?.split("T")[0] ?? "9999-12-31";
  const time = m.match.start_time ?? "99:99";
  const court = String(m.match.court_id ?? 9999).padStart(6, "0");
  return `${date}|${time}|${court}|${m.tournamentId}|${ROUND_ORDER[m.round] ?? 9}|${m.bracketPos}`;
}

function normalizeTournamentList(
  data: PlayoffSchedulePreviewTournament[] | { tournaments?: PlayoffSchedulePreviewTournament[] } | null | undefined
): PlayoffSchedulePreviewTournament[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.tournaments)) return data.tournaments;
  return [];
}

function flattenTournaments(
  tournaments: PlayoffSchedulePreviewTournament[]
): FlatMatch[] {
  const out: FlatMatch[] = [];
  for (const t of tournaments) {
    const playoffDuration = playoffMatchDurationMinutes(
      t.match_duration_quarters_onwards ?? t.match_duration ?? 60
    );
    for (const row of t.rows) {
      if (!row.match) continue;
      const hasTeams = row.match.team1 || row.match.team2;
      const hasSchedule =
        row.match.match_date || row.match.start_time || row.match.court_id;
      if (!hasTeams && !hasSchedule) continue;
      out.push({
        key: `${t.id}-${row.id}-${row.match.id}`,
        tournamentId: t.id,
        tournamentName: t.name,
        playoffDuration,
        round: row.round,
        bracketPos: row.bracket_pos,
        row,
        match: row.match,
      });
    }
  }
  return out.sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
}

function flattenPlannedTournaments(
  planned: PlannedTournamentPreview[]
): FlatMatch[] {
  const out: FlatMatch[] = [];
  for (const t of planned) {
    const playoffDuration = playoffMatchDurationMinutes(
      t.match_duration_quarters_onwards ?? t.match_duration ?? 60
    );
    for (const m of t.matches) {
      const hasTeams =
        m.team1Label !== "—" ||
        m.team2Label !== "—" ||
        m.team1Label.includes("BYE") ||
        m.team2Label.includes("BYE");
      const hasSchedule = m.match_date || m.start_time || m.court_id;
      if (!hasTeams && !hasSchedule) continue;
      out.push({
        key: `planned-${t.id}-${m.round}-${m.bracket_pos}`,
        tournamentId: t.id,
        tournamentName: t.name,
        playoffDuration,
        round: m.round,
        bracketPos: m.bracket_pos,
        team1Display: m.team1Label,
        team2Display: m.team2Label,
        match: {
          id: 0,
          team1_id: null,
          team2_id: null,
          status: "scheduled",
          match_date: m.match_date,
          start_time: m.start_time,
          end_time: m.end_time,
          court_id: m.court_id,
          team1: null,
          team2: null,
          set1_team1_games: null,
          set1_team2_games: null,
          set2_team1_games: null,
          set2_team2_games: null,
          set3_team1_games: null,
          set3_team2_games: null,
          super_tiebreak_team1_points: null,
          super_tiebreak_team2_points: null,
        },
      });
    }
  }
  return out.sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
}

type PlayoffSchedulePreviewProps = {
  tournamentIds?: number[];
  plannedTournaments?: PlannedTournamentPreview[];
  onPlannedTournamentsChange?: (tournaments: PlannedTournamentPreview[]) => void;
  readOnly?: boolean;
  title?: string;
  description?: string;
  compact?: boolean;
};

async function fetchPreview(
  tournamentIds?: number[]
): Promise<PlayoffSchedulePreviewTournament[]> {
  const qs =
    tournamentIds && tournamentIds.length > 0
      ? `?ids=${tournamentIds.join(",")}`
      : "";
  const data = await tournamentsService.getPlayoffsSchedulePreview(qs);
  return data.tournaments;
}

export function PlayoffSchedulePreview({
  tournamentIds,
  plannedTournaments,
  onPlannedTournamentsChange,
  readOnly = false,
  title = "Vista previa de horarios",
  description = "Revisá y ajustá fecha, hora y cancha de cada partido de playoff.",
  compact = false,
}: PlayoffSchedulePreviewProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"timeline" | "tournament">("timeline");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editCourtId, setEditCourtId] = useState("none");
  const [saving, setSaving] = useState(false);

  const queryKey = [
    "playoffs-schedule-preview",
    tournamentIds?.join(",") ?? "all",
  ] as const;

  const isPlannedMode = Boolean(plannedTournaments?.length);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchPreview(tournamentIds),
    staleTime: 1000 * 15,
    enabled: !isPlannedMode,
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

  const tournamentList = useMemo(() => {
    if (isPlannedMode && plannedTournaments) {
      return plannedTournaments.map((t) => ({
        id: t.id,
        name: t.name,
        status: "playoffs_ready",
        match_duration: t.match_duration,
        match_duration_quarters_onwards: t.match_duration_quarters_onwards,
        rows: [] as PlayoffRow[],
      }));
    }
    return normalizeTournamentList(data);
  }, [data, isPlannedMode, plannedTournaments]);

  const flatMatches = useMemo(() => {
    if (isPlannedMode && plannedTournaments) {
      return flattenPlannedTournaments(plannedTournaments);
    }
    return flattenTournaments(tournamentList);
  }, [isPlannedMode, plannedTournaments, tournamentList]);

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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["playoffs-schedule-preview"] });
    void queryClient.invalidateQueries({ queryKey: ["tournament-playoffs"] });
  };

  const startEdit = (item: FlatMatch) => {
    setEditingKey(item.key);
    setEditDate(item.match.match_date ? item.match.match_date.split("T")[0] : "");
    setEditTime(item.match.start_time ?? "");
    setEditEndTime(
      resolveMatchEndTime(
        item.match.start_time ?? "",
        item.match.end_time,
        item.playoffDuration
      ) || ""
    );
    setEditCourtId(
      item.match.court_id ? String(item.match.court_id) : "none"
    );
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditDate("");
    setEditTime("");
    setEditEndTime("");
    setEditCourtId("none");
  };

  const savePlannedEdit = (item: FlatMatch) => {
    if (!editDate || !editTime) {
      alert("Fecha y hora de inicio son requeridos");
      return;
    }
    if (editCourtId === "none") {
      alert("Elegí una cancha");
      return;
    }
    if (!plannedTournaments || !onPlannedTournamentsChange) return;

    const endTime =
      editEndTime.trim() ||
      resolveMatchEndTime(editTime, null, item.playoffDuration) ||
      editTime;
    const courtId =
      editCourtId === "none" ? null : Number(editCourtId);

    const updated = plannedTournaments.map((t) => {
      if (t.id !== item.tournamentId) return t;
      return {
        ...t,
        matches: t.matches.map((m) => {
          if (m.round !== item.round || m.bracket_pos !== item.bracketPos) {
            return m;
          }
          return {
            ...m,
            match_date: editDate,
            start_time: editTime,
            end_time: endTime,
            court_id: courtId,
          };
        }),
      };
    });

    onPlannedTournamentsChange(updated);
    cancelEdit();
  };

  const saveEdit = async (item: FlatMatch) => {
    if (!editDate || !editTime) {
      alert("Fecha y hora de inicio son requeridos");
      return;
    }

    if (isPlannedMode && onPlannedTournamentsChange) {
      savePlannedEdit(item);
      return;
    }

    try {
      setSaving(true);
      const endTime =
        editEndTime.trim() ||
        resolveMatchEndTime(editTime, null, item.playoffDuration) ||
        editTime;
      await tournamentMatchesService.scheduleMatch(item.match.id, {
        date: editDate,
        start_time: editTime,
        end_time: endTime,
        court_id: editCourtId === "none" ? undefined : Number(editCourtId),
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

  const renderRow = (item: FlatMatch) => {
    const isEditing = editingKey === item.key;
    const tournamentColor = tournamentColorById.get(item.tournamentId);
    const label1 = item.team1Display ?? teamLabel(item.match.team1);
    const label2 = item.team2Display ?? teamLabel(item.match.team2);
    const vs =
      label1 !== "—" && label2 !== "—"
        ? `${label1} vs ${label2}`
        : label1 !== "—" || label2 !== "—"
          ? `${label1 !== "—" ? label1 : label2} (BYE)`
          : "Por definir";

    return (
      <TableRow
        key={item.key}
        className={cn(
          "border-l-4 transition-colors",
          tournamentColor?.row,
          tournamentColor?.border
        )}
      >
        {viewMode === "timeline" && (
          <TableCell
            className={cn(
              "text-xs font-medium whitespace-nowrap",
              tournamentColor?.label
            )}
          >
            {item.tournamentName}
          </TableCell>
        )}
        <TableCell className="whitespace-nowrap">
          <Badge variant="outline" className="text-[10px]">
            {ROUND_LABELS[item.round] ?? item.round}
          </Badge>
        </TableCell>
        <TableCell className="text-sm min-w-[180px]">{vs}</TableCell>
        {isEditing ? (
          <>
            <TableCell>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-8 text-xs w-[130px]"
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
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
            <TableCell>
              <Select value={editCourtId} onValueChange={setEditCourtId}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="Cancha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cancha</SelectItem>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={String(court.id)}>
                      {court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={saving}
                  onClick={() => saveEdit(item)}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={cancelEdit}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </>
        ) : (
          <>
            <TableCell className="text-xs whitespace-nowrap">
              {item.match.match_date
                ? formatDate(item.match.match_date)
                : "—"}
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap">
              {item.match.start_time
                ? formatTimeRange(
                    item.match.start_time,
                    resolveMatchEndTime(
                      item.match.start_time,
                      item.match.end_time,
                      item.playoffDuration
                    )
                  )
                : "—"}
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap">
              {item.match.court_id
                ? courtMap.get(item.match.court_id) ?? `Cancha ${item.match.court_id}`
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              {!readOnly &&
                (item.match.id > 0 ||
                  (isPlannedMode && Boolean(onPlannedTournamentsChange))) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => startEdit(item)}
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </Button>
              )}
            </TableCell>
          </>
        )}
      </TableRow>
    );
  };

  if (!isPlannedMode && isLoading) {
    return (
      <div className="h-[160px] flex items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isPlannedMode && isError) {
    return (
      <p className="text-sm text-destructive">
        No se pudo cargar la vista previa de horarios.
      </p>
    );
  }

  if (!tournamentList.length || flatMatches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay partidos de playoff con horarios para mostrar.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`font-semibold ${compact ? "text-base" : "text-lg"}`}>
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
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

      <p className="text-xs text-muted-foreground">
        {flatMatches.length} partido(s) · {tournamentList.length} torneo(s)
      </p>

      {tournamentList.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2">
          {tournamentList.map((t) => {
            const color = tournamentColorById.get(t.id);
            return (
              <span
                key={t.id}
                className="inline-flex items-center gap-2 text-xs font-medium"
              >
                <span
                  className={cn("h-3 w-3 shrink-0 rounded-sm", color?.swatch)}
                  aria-hidden
                />
                <span className={color?.label}>{t.name}</span>
              </span>
            );
          })}
        </div>
      )}

      {viewMode === "timeline" ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Torneo</TableHead>
                <TableHead>Ronda</TableHead>
                <TableHead>Partido</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Cancha</TableHead>
                <TableHead className="w-[52px]" />
              </TableRow>
            </TableHeader>
            <TableBody>{flatMatches.map(renderRow)}</TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByTournament.map(([name, items]) => {
            const color = tournamentColorById.get(items[0]?.tournamentId ?? -1);
            return (
            <div key={name} className="space-y-2">
              <h4
                className={cn(
                  "text-sm font-medium inline-flex items-center gap-2 rounded-md px-2 py-1",
                  color?.row,
                  color?.label
                )}
              >
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", color?.swatch)}
                  aria-hidden
                />
                {name}
              </h4>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ronda</TableHead>
                      <TableHead>Partido</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Horario</TableHead>
                      <TableHead>Cancha</TableHead>
                      <TableHead className="w-[52px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>{items.map(renderRow)}</TableBody>
                </Table>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
