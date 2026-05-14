"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2Icon, ArrowLeftRightIcon, CheckIcon, XIcon, UndoIcon, UsersIcon, FolderIcon } from "lucide-react";
import { formatDate, formatTime } from "@/lib/date-utils";
import { toHHMM } from "@/lib/build-schedule-days-from-slots";
import { parseLocalDate } from "@/lib/court-slots-utils";
import type { MatchDTO, TeamDTO, GroupDTO, TournamentGroupSlotSummary } from "@/models/dto/tournament";
import type { CourtDTO } from "@/models/dto/court";
import { useQuery } from "@tanstack/react-query";
import { tournamentMatchesService } from "@/services";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GroupScheduleViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: MatchDTO[];
  groups: GroupDTO[];
  tournamentId: number;
  onScheduleUpdated?: () => void;
  /** Slots del torneo para detectar si un partido viola restricción horaria de algún equipo */
  tournamentGroupSlots?: TournamentGroupSlotSummary[];
  /**
   * Canchas de la corrida de grupos guardadas en el torneo (cerrar inscripción / regenerar).
   * Sin esto, solo se infieren canchas ya asignadas a partidos y puede faltar una cancha sin uso.
   */
  groupScheduleCourtIds?: number[];
}

function teamShortLabel(team: TeamDTO): string {
  if (team.display_name?.trim()) return team.display_name.trim();
  const ln1 = team.player1?.last_name ?? "";
  const ln2 = team.player2?.last_name ?? "";
  const pair = [ln1, ln2].filter(Boolean).join("–");
  if (pair) return pair;
  return `Equipo ${team.id}`;
}

function teamLabel(team: TeamDTO | null, matchOrder?: number | null, isTeam1?: boolean) {
  if (!team) {
    if (matchOrder === 3) {
      return isTeam1 ? "GANADOR 1" : "GANADOR 2";
    } else if (matchOrder === 4) {
      return isTeam1 ? "PERDEDOR 1" : "PERDEDOR 2";
    }
    return "Equipo";
  }
  if (team.display_name) return team.display_name;
  return `${team.player1?.first_name ?? ""} ${team.player1?.last_name ?? ""} / ${
    team.player2?.first_name ?? ""
  } ${team.player2?.last_name ?? ""}`;
}

// Función para obtener el color del grupo basado en su índice
function getGroupColor(groupIndex: number): { bg: string; text: string; border: string; badgeBg: string; badgeText: string } {
  const colorSchemes = [
    // Azules
    { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", badgeBg: "bg-blue-100", badgeText: "text-blue-800" },
    // Verdes
    { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", badgeBg: "bg-green-100", badgeText: "text-green-800" },
    // Amarillos
    { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", badgeBg: "bg-amber-100", badgeText: "text-amber-800" },
    // Naranjas
    { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", badgeBg: "bg-orange-100", badgeText: "text-orange-800" },
    // Púrpuras
    { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", badgeBg: "bg-purple-100", badgeText: "text-purple-800" },
    // Rosas
    { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", badgeBg: "bg-pink-100", badgeText: "text-pink-800" },
    // Cyan
    { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", badgeBg: "bg-cyan-100", badgeText: "text-cyan-800" },
    // Indigo
    { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", badgeBg: "bg-indigo-100", badgeText: "text-indigo-800" },
  ];
  
  return colorSchemes[groupIndex % colorSchemes.length] || colorSchemes[0];
}

// Calcular diferencia en minutos entre dos horarios
function calculateTimeDiff(
  date1: string | null,
  time1: string | null,
  date2: string | null,
  time2: string | null
): number | null {
  if (!date1 || !time1 || !date2 || !time2) return null;
  
  const d1 = parseLocalDate(date1);
  const [h1, m1] = time1.split(":").map(Number);
  d1.setHours(h1, m1, 0, 0);
  
  const d2 = parseLocalDate(date2);
  const [h2, m2] = time2.split(":").map(Number);
  d2.setHours(h2, m2, 0, 0);
  
  return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60); // diferencia en minutos
}

// Formatear minutos a texto legible
function formatTimeDiff(minutes: number | null): string {
  if (minutes === null) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

// Obtener clases CSS para el highlight del equipo basado en la diferencia
function getTeamHighlightClass(diff: number | null): string {
  if (diff === null) return "";
  
  // Misma lógica que el Badge de diff
  if (diff <= 60 || diff > 240) {
    // Rojo para <= 1h o > 4h
    return "bg-red-100 text-red-800 font-bold";
  } else if (diff === 240) {
    // Amarillo para 4h exactas
    return "bg-yellow-100 text-yellow-800 font-bold";
  } else if (diff >= 120 && diff <= 180) {
    // Verde para 2-3h (incluyendo 180 minutos = 3h)
    return "bg-green-100 text-green-800 font-bold";
  }
  // Por defecto, sin highlight especial
  return "";
}

export function GroupScheduleViewer({
  open,
  onOpenChange,
  matches,
  groups,
  tournamentId,
  onScheduleUpdated,
  tournamentGroupSlots = [],
  groupScheduleCourtIds = [],
}: GroupScheduleViewerProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"matches" | "groups" | "teams">("matches");
  const [selectedGroup1, setSelectedGroup1] = useState<number | null>(null);
  const [selectedGroup2, setSelectedGroup2] = useState<number | null>(null);
  const [selectedTeam1, setSelectedTeam1] = useState<{ teamId: number; groupId: number } | null>(null);
  const [selectedTeam2, setSelectedTeam2] = useState<{ teamId: number; groupId: number } | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [lastSwap, setLastSwap] = useState<{
    match1Id: number;
    match2Id: number;
    match1Original: { date: string; start_time: string; end_time: string | null; court_id: number | null };
    match2Original: { date: string; start_time: string; end_time: string | null; court_id: number | null };
  } | null>(null);
  const [selectedRow1, setSelectedRow1] = useState<string | null>(null);
  const [selectedRow2, setSelectedRow2] = useState<string | null>(null);

  // Obtener canchas para mostrar nombres
  const { data: courts = [] } = useQuery<CourtDTO[]>({
    queryKey: ["courts"],
    queryFn: async () => {
      const response = await fetch("/api/courts?onlyActive=true");
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  // Crear mapa de ID a nombre de cancha
  const courtMap = new Map<number, string>();
  courts.forEach((court) => {
    courtMap.set(court.id, court.name);
  });

  // Crear mapa de grupo id -> nombre e índice
  const groupMap = new Map<number, { name: string; index: number }>();
  // Ordenar grupos por group_order o nombre para consistencia
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.group_order !== undefined && b.group_order !== undefined) {
      return a.group_order - b.group_order;
    }
    return a.name.localeCompare(b.name);
  });
  sortedGroups.forEach((g, index) => {
    groupMap.set(g.id, { name: g.name, index });
  });

  // Filtrar solo partidos con horarios asignados y ordenarlos
  const scheduledMatches = useMemo(() => {
    return matches
      .filter((m) => m.match_date && m.start_time)
      .sort((a, b) => {
        if (a.match_date && b.match_date) {
          const dateCompare = a.match_date.localeCompare(b.match_date);
          if (dateCompare !== 0) return dateCompare;
        }
        if (a.start_time && b.start_time) {
          return a.start_time.localeCompare(b.start_time);
        }
        return 0;
      });
  }, [matches]);

  /** Lista persistida ∪ canchas ya asignadas en partidos (evita perder una cancha si la API viene incompleta). */
  const tournamentCourtIds = useMemo(() => {
    const persisted = groupScheduleCourtIds.filter((id) => Number.isFinite(id));
    const fromMatches = new Set<number>();
    for (const m of matches) {
      if (m.phase === "group" && m.court_id != null) fromMatches.add(m.court_id);
    }
    if (persisted.length > 0) {
      return Array.from(new Set([...persisted, ...Array.from(fromMatches)])).sort((a, b) => a - b);
    }
    return Array.from(fromMatches).sort((a, b) => a - b);
  }, [matches, groupScheduleCourtIds]);

  type ScheduleRow =
    | {
        key: string;
        type: "match";
        slotDate: string;
        startTime: string;
        endTime: string | null;
        match: MatchDTO;
      }
    | {
        key: string;
        type: "free";
        slotDate: string;
        startTime: string;
        endTime: string | null;
        /** Definido cuando sabemos las canchas del torneo (partidos de zona ya tienen cancha). */
        courtId?: number;
      };

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const rows: ScheduleRow[] = scheduledMatches
      .filter((m) => m.id != null)
      .map((match) => ({
        key: `match-${match.id}`,
        type: "match" as const,
        slotDate: String(match.match_date!).trim().slice(0, 10),
        startTime: match.start_time!,
        endTime: match.end_time ?? null,
        match,
      }));

    if (tournamentCourtIds.length > 0 && (tournamentGroupSlots ?? []).length > 0) {
      const occupiedRemaining = new Map<string, number>();
      for (const match of scheduledMatches) {
        if (match.court_id == null || !match.match_date || !match.start_time) continue;
        const d = String(match.match_date).trim().slice(0, 10);
        const tNorm = toHHMM(match.start_time);
        const cellKey = `${d}\t${tNorm}\t${match.court_id}`;
        occupiedRemaining.set(cellKey, (occupiedRemaining.get(cellKey) ?? 0) + 1);
      }

      /** Partidos con horario pero sin cancha: ocupan una celda horario-cancha (primero en orden de iteración). */
      const unassignedRemaining = new Map<string, number>();
      for (const match of scheduledMatches) {
        if (match.court_id != null || !match.match_date || !match.start_time) continue;
        const d = String(match.match_date).trim().slice(0, 10);
        const tNorm = toHHMM(match.start_time);
        const dtKey = `${d}\t${tNorm}`;
        unassignedRemaining.set(dtKey, (unassignedRemaining.get(dtKey) ?? 0) + 1);
      }

      let freeIdx = 0;
      for (const slot of tournamentGroupSlots ?? []) {
        const d = String(slot.slot_date).trim().slice(0, 10);
        const tNorm = toHHMM(slot.start_time);
        const dtKey = `${d}\t${tNorm}`;
        for (const courtId of tournamentCourtIds) {
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
                startTime: slot.start_time,
                endTime: slot.end_time ?? null,
                courtId,
              });
            }
          }
        }
      }
    } else {
      const occupiedCountByDateTime = new Map<string, number>();
      for (const match of scheduledMatches) {
        const d = String(match.match_date).trim().slice(0, 10);
        const key = `${d}\t${toHHMM(match.start_time!)}`;
        occupiedCountByDateTime.set(key, (occupiedCountByDateTime.get(key) ?? 0) + 1);
      }

      const slotCountByDateTime = new Map<
        string,
        { slotDate: string; startTime: string; endTime: string | null; count: number }
      >();
      for (const slot of tournamentGroupSlots ?? []) {
        const d = String(slot.slot_date).trim().slice(0, 10);
        const key = `${d}\t${toHHMM(slot.start_time)}`;
        const current = slotCountByDateTime.get(key);
        if (current) {
          current.count += 1;
        } else {
          slotCountByDateTime.set(key, {
            slotDate: d,
            startTime: slot.start_time,
            endTime: slot.end_time ?? null,
            count: 1,
          });
        }
      }

      slotCountByDateTime.forEach((slotInfo, key) => {
        const occupied = occupiedCountByDateTime.get(key) ?? 0;
        const freeCount = Math.max(0, slotInfo.count - occupied);
        for (let i = 0; i < freeCount; i++) {
          rows.push({
            key: `free-${slotInfo.slotDate}-${slotInfo.startTime}-${i}`,
            type: "free",
            slotDate: slotInfo.slotDate,
            startTime: slotInfo.startTime,
            endTime: slotInfo.endTime,
          });
        }
      });
    }

    rows.sort((a, b) => {
      const dateCompare = a.slotDate.localeCompare(b.slotDate);
      if (dateCompare !== 0) return dateCompare;
      const timeCompare = toHHMM(a.startTime).localeCompare(toHHMM(b.startTime));
      if (timeCompare !== 0) return timeCompare;
      if (a.type !== b.type) return a.type === "match" ? -1 : 1;
      if (a.type === "match" && b.type === "match") return a.match.id - b.match.id;
      const ac = a.type === "free" ? (a.courtId ?? 0) : 0;
      const bc = b.type === "free" ? (b.courtId ?? 0) : 0;
      if (ac !== bc) return ac - bc;
      return a.key.localeCompare(b.key);
    });

    return rows;
  }, [scheduledMatches, tournamentGroupSlots, tournamentCourtIds]);

  /** Zonas de 4: los cuatro equipos obtenidos de los partidos de 1ª ronda (match_order 1 y 2). */
  const fourTeamsByGroupId = useMemo(() => {
    const map = new Map<number, Map<number, TeamDTO>>();
    for (const m of matches) {
      if (!m.tournament_group_id) continue;
      if (m.match_order !== 1 && m.match_order !== 2) continue;
      const gid = m.tournament_group_id;
      if (!map.has(gid)) map.set(gid, new Map());
      const inner = map.get(gid)!;
      if (m.team1?.id) inner.set(m.team1.id, m.team1);
      if (m.team2?.id) inner.set(m.team2.id, m.team2);
    }
    const out = new Map<number, TeamDTO[]>();
    map.forEach((inner, gid) => {
      const arr = Array.from(inner.values());
      if (arr.length === 4) out.set(gid, arr);
    });
    return out;
  }, [matches]);

  // Calcular diferencias de tiempo para cada partido (mínima y máxima diferencia con otro partido del mismo equipo en el mismo día)
  const matchTimeDiffs = useMemo(() => {
    // Función auxiliar para obtener equipos lógicos de un partido (para grupos de 4)
    // Retorna un array de IDs de equipos que representan lógicamente a este partido
    const getLogicalTeamIds = (match: MatchDTO): number[] => {
      // Si el partido tiene equipos reales, usarlos
      if (match.team1?.id && match.team2?.id) {
        return [match.team1.id, match.team2.id];
      }
      
      // Si es un partido de ganadores/perdedores (match_order 3 o 4) sin equipos asignados
      if ((match.match_order === 3 || match.match_order === 4) && match.tournament_group_id) {
        // Buscar los partidos con match_order 1 y 2 del mismo grupo
        const match1 = scheduledMatches.find(
          m => m.tournament_group_id === match.tournament_group_id && m.match_order === 1
        );
        const match2 = scheduledMatches.find(
          m => m.tournament_group_id === match.tournament_group_id && m.match_order === 2
        );
        
        if (match1 && match2 && match1.team1?.id && match1.team2?.id && match2.team1?.id && match2.team2?.id) {
          // Para match_order 3 (GANADOR 1 vs GANADOR 2): los equipos pueden ser cualquiera de los 4
          // Para match_order 4 (PERDEDOR 1 vs PERDEDOR 2): los equipos pueden ser cualquiera de los 4
          // Retornamos todos los equipos de los partidos 1 y 2 para que se consideren en el cálculo
          return [match1.team1.id, match1.team2.id, match2.team1.id, match2.team2.id];
        }
      }
      
      return [];
    };

    // Función auxiliar para verificar si algún equipo lógico de un partido juega en otro partido
    const teamsOverlap = (match1: MatchDTO, match2: MatchDTO): boolean => {
      const teams1 = getLogicalTeamIds(match1);
      const teams2 = getLogicalTeamIds(match2);
      
      // Verificar si hay intersección entre los equipos lógicos
      return teams1.some(t1 => teams2.includes(t1));
    };
    const diffs = new Map<number, { minDiff: number | null; maxDiff: number | null; teamWithMaxDiff: 'team1' | 'team2' | null; team1MaxDiff: number | null; team2MaxDiff: number | null }>(); // matchId -> { minDiff, maxDiff, teamWithMaxDiff, team1MaxDiff, team2MaxDiff }
    
    scheduledMatches.forEach((match) => {
      if (!match.match_date || !match.start_time) {
        diffs.set(match.id, { minDiff: null, maxDiff: null, teamWithMaxDiff: null, team1MaxDiff: null, team2MaxDiff: null });
        return;
      }
      
      const logicalTeamIds = getLogicalTeamIds(match);
      
      if (logicalTeamIds.length === 0) {
        diffs.set(match.id, { minDiff: null, maxDiff: null, teamWithMaxDiff: null, team1MaxDiff: null, team2MaxDiff: null });
        return;
      }
      
      // Para cada equipo lógico, calcular su máxima diferencia
      const teamMaxDiffs = new Map<number, number>(); // teamId -> maxDiff
      let minDiff: number | null = null;
      
      // Determinar si el partido actual es de ganadores/perdedores (sin equipos reales)
      const isMatchWithoutRealTeams = (match.match_order === 3 || match.match_order === 4) && !match.team1?.id && !match.team2?.id;
      
      // Buscar otros partidos del mismo equipo en el mismo día
      scheduledMatches.forEach((otherMatch) => {
        if (otherMatch.id === match.id) return;
        if (otherMatch.match_date !== match.match_date) return;
        if (!otherMatch.start_time) return;
        
        // Si el partido actual es de ganadores/perdedores, solo comparar con partidos que tienen equipos reales
        if (isMatchWithoutRealTeams) {
          // Solo comparar con partidos que tienen equipos asignados (no con otros partidos de ganadores/perdedores)
          if (!otherMatch.team1?.id || !otherMatch.team2?.id) {
            return; // Saltar partidos sin equipos reales
          }
        }
        
        // Verificar si hay equipos en común entre los dos partidos
        if (teamsOverlap(match, otherMatch)) {
          const diff = calculateTimeDiff(
            match.match_date,
            match.start_time,
            otherMatch.match_date,
            otherMatch.start_time
          );
          
          if (diff !== null) {
            // Actualizar mínima diferencia
            if (minDiff === null || diff < minDiff) {
              minDiff = diff;
            }
            
            // Actualizar máxima diferencia para cada equipo lógico que participa
            logicalTeamIds.forEach(teamId => {
              const otherLogicalTeamIds = getLogicalTeamIds(otherMatch);
              if (otherLogicalTeamIds.includes(teamId)) {
                const currentMax = teamMaxDiffs.get(teamId);
                if (currentMax === undefined || diff > currentMax) {
                  teamMaxDiffs.set(teamId, diff);
                }
              }
            });
          }
        }
      });
      
      // Determinar la máxima diferencia general y qué equipo la tiene
      let maxDiff: number | null = null;
      let teamWithMaxDiff: 'team1' | 'team2' | null = null;
      
      // Si el partido tiene equipos reales, usar team1 y team2
      let team1MaxDiff: number | null = null;
      let team2MaxDiff: number | null = null;
      
      if (match.team1?.id && match.team2?.id) {
        team1MaxDiff = teamMaxDiffs.get(match.team1.id) ?? null;
        team2MaxDiff = teamMaxDiffs.get(match.team2.id) ?? null;
        
        if (team1MaxDiff !== null && team2MaxDiff !== null) {
          if (team1MaxDiff >= team2MaxDiff) {
            maxDiff = team1MaxDiff;
            teamWithMaxDiff = 'team1';
          } else {
            maxDiff = team2MaxDiff;
            teamWithMaxDiff = 'team2';
          }
        } else if (team1MaxDiff !== null) {
          maxDiff = team1MaxDiff;
          teamWithMaxDiff = 'team1';
        } else if (team2MaxDiff !== null) {
          maxDiff = team2MaxDiff;
          teamWithMaxDiff = 'team2';
        }
      } else {
        // Para partidos sin equipos reales, usar la máxima diferencia de todos los equipos lógicos
        let maxTeamId: number | null = null;
        let maxTeamDiff: number | null = null;
        
        teamMaxDiffs.forEach((diff, teamId) => {
          if (maxTeamDiff === null || diff > maxTeamDiff) {
            maxTeamDiff = diff;
            maxTeamId = teamId;
          }
        });
        
        if (maxTeamDiff !== null) {
          maxDiff = maxTeamDiff;
          // Determinar si corresponde a team1 o team2 basado en el match_order
          if (match.match_order === 3) {
            // GANADOR 1 vs GANADOR 2: usar team1 si es del match_order 1, team2 si es del match_order 2
            const match1 = scheduledMatches.find(
              m => m.tournament_group_id === match.tournament_group_id && m.match_order === 1
            );
            if (match1 && (match1.team1?.id === maxTeamId || match1.team2?.id === maxTeamId)) {
              teamWithMaxDiff = 'team1';
            } else {
              teamWithMaxDiff = 'team2';
            }
          } else if (match.match_order === 4) {
            // PERDEDOR 1 vs PERDEDOR 2: usar team1 si es del match_order 1, team2 si es del match_order 2
            const match1 = scheduledMatches.find(
              m => m.tournament_group_id === match.tournament_group_id && m.match_order === 1
            );
            if (match1 && (match1.team1?.id === maxTeamId || match1.team2?.id === maxTeamId)) {
              teamWithMaxDiff = 'team1';
            } else {
              teamWithMaxDiff = 'team2';
            }
          }
        }
      }
      
      diffs.set(match.id, { minDiff, maxDiff, teamWithMaxDiff, team1MaxDiff, team2MaxDiff });
    });
    
    return diffs;
  }, [scheduledMatches]);

  // Obtener equipos únicos por grupo
  const teamsByGroup = useMemo(() => {
    const map = new Map<number, Set<number>>();
    matches.forEach((match) => {
      if (!match.tournament_group_id) return;
      if (!map.has(match.tournament_group_id)) {
        map.set(match.tournament_group_id, new Set());
      }
      const groupSet = map.get(match.tournament_group_id)!;
      if (match.team1?.id) groupSet.add(match.team1.id);
      if (match.team2?.id) groupSet.add(match.team2.id);
    });
    return map;
  }, [matches]);

  // Obtener equipos únicos con información completa
  const teamsList = useMemo(() => {
    const teamMap = new Map<number, { team: TeamDTO; groupId: number }>();
    matches.forEach((match) => {
      if (!match.tournament_group_id) return;
      if (match.team1?.id && !teamMap.has(match.team1.id)) {
        teamMap.set(match.team1.id, { team: match.team1, groupId: match.tournament_group_id });
      }
      if (match.team2?.id && !teamMap.has(match.team2.id)) {
        teamMap.set(match.team2.id, { team: match.team2, groupId: match.tournament_group_id });
      }
    });
    return Array.from(teamMap.values());
  }, [matches]);

  // Cabezas de zona fijados: menor display_order por grupo.
  const fixedHeadTeamIds = useMemo(() => {
    const byGroup = new Map<number, { teamId: number; displayOrder: number; tieId: number }>();
    matches.forEach((match) => {
      if (!match.tournament_group_id) return;
      [match.team1, match.team2].forEach((team) => {
        if (!team?.id || team.display_order == null) return;
        const current = byGroup.get(match.tournament_group_id!);
        const candidate = {
          teamId: team.id,
          displayOrder: team.display_order,
          tieId: team.id,
        };
        if (
          !current ||
          candidate.displayOrder < current.displayOrder ||
          (candidate.displayOrder === current.displayOrder && candidate.tieId < current.tieId)
        ) {
          byGroup.set(match.tournament_group_id!, candidate);
        }
      });
    });
    return new Set(Array.from(byGroup.values()).map((x) => x.teamId));
  }, [matches]);

  // ¿El partido viola restricción horaria? En zona de 4, ronda ganadores/perdedores (3–4): cualquiera de los 4 puede jugar → se marca si alguno no puede en ese slot.
  const matchSlotViolation = useMemo(() => {
    const violation = new Map<
      number,
      { team1: boolean; team2: boolean; round2TeamsCantPlay?: TeamDTO[] }
    >();
    if (!tournamentGroupSlots?.length) return violation;
    const slotByDateTime = new Map<string, number>();
    tournamentGroupSlots.forEach((s) => {
      slotByDateTime.set(`${s.slot_date}\t${s.start_time}`, s.id);
    });
    scheduledMatches.forEach((match) => {
      if (!match.match_date || !match.start_time) return;
      const slotId = slotByDateTime.get(`${match.match_date}\t${match.start_time}`);
      if (slotId === undefined) return;

      const gid = match.tournament_group_id;
      if (
        gid &&
        (match.match_order === 3 || match.match_order === 4)
      ) {
        const four = fourTeamsByGroupId.get(gid);
        if (four && four.length === 4) {
          const cantPlay = four.filter((t) => t.restricted_slot_ids?.includes(slotId));
          if (cantPlay.length > 0) {
            violation.set(match.id, {
              team1: false,
              team2: false,
              round2TeamsCantPlay: cantPlay,
            });
          }
          return;
        }
        const t1Restricted = match.team1?.restricted_slot_ids?.includes(slotId) ?? false;
        const t2Restricted = match.team2?.restricted_slot_ids?.includes(slotId) ?? false;
        if (t1Restricted || t2Restricted) {
          violation.set(match.id, { team1: t1Restricted, team2: t2Restricted });
        }
        return;
      }

      const t1Restricted = match.team1?.restricted_slot_ids?.includes(slotId) ?? false;
      const t2Restricted = match.team2?.restricted_slot_ids?.includes(slotId) ?? false;
      if (t1Restricted || t2Restricted) {
        violation.set(match.id, { team1: t1Restricted, team2: t2Restricted });
      }
    });
    return violation;
  }, [scheduledMatches, tournamentGroupSlots, fourTeamsByGroupId]);

  // Calcular si algún equipo del partido juega en días diferentes
  const matchMultiDayInfo = useMemo(() => {
    const info = new Map<number, { team1PlaysMultipleDays: boolean; team2PlaysMultipleDays: boolean }>(); // matchId -> info
    
    scheduledMatches.forEach((match) => {
      if (!match.team1?.id || !match.team2?.id || !match.match_date) {
        info.set(match.id, { team1PlaysMultipleDays: false, team2PlaysMultipleDays: false });
        return;
      }
      
      const team1Id = match.team1.id;
      const team2Id = match.team2.id;
      const matchDate = match.match_date;
      
      const team1Days = new Set<string>();
      const team2Days = new Set<string>();
      
      // Agregar el día del partido actual
      team1Days.add(matchDate);
      team2Days.add(matchDate);
      
      // Buscar otros partidos de los mismos equipos
      scheduledMatches.forEach((otherMatch) => {
        if (!otherMatch.match_date) return;
        
        // Verificar si team1 juega en otherMatch
        if (otherMatch.team1?.id === team1Id || otherMatch.team2?.id === team1Id) {
          team1Days.add(otherMatch.match_date);
        }
        
        // Verificar si team2 juega en otherMatch
        if (otherMatch.team1?.id === team2Id || otherMatch.team2?.id === team2Id) {
          team2Days.add(otherMatch.match_date);
        }
      });
      
      info.set(match.id, {
        team1PlaysMultipleDays: team1Days.size > 1,
        team2PlaysMultipleDays: team2Days.size > 1,
      });
    });
    
    return info;
  }, [scheduledMatches]);

  // Calcular métricas generales
  const scheduleMetrics = useMemo(() => {
    // 1. Suma de diff max mismo equipo
    let totalMaxDiff = 0;
    let countMaxDiff = 0;
    matchTimeDiffs.forEach(({ maxDiff }) => {
      if (maxDiff !== null) {
        totalMaxDiff += maxDiff;
        countMaxDiff++;
      }
    });

    // 2. Scoring por zona
    const zoneMetrics = new Map<number, {
      groupName: string;
      totalMaxDiff: number;
      countMaxDiff: number;
      avgMaxDiff: number;
      totalMinDiff: number;
      countMinDiff: number;
      avgMinDiff: number;
      problemMatches: number; // matches con diff < 60min o > 240min
      multiDayTeams: number;
    }>();

    // Set por zona para contar equipos únicos que juegan en múltiples días
    const multiDayTeamsByZone = new Map<number, Set<number>>();

    scheduledMatches.forEach((match) => {
      if (!match.tournament_group_id) return;
      
      const groupInfo = groupMap.get(match.tournament_group_id);
      if (!groupInfo) return;

      if (!zoneMetrics.has(match.tournament_group_id)) {
        zoneMetrics.set(match.tournament_group_id, {
          groupName: groupInfo.name,
          totalMaxDiff: 0,
          countMaxDiff: 0,
          avgMaxDiff: 0,
          totalMinDiff: 0,
          countMinDiff: 0,
          avgMinDiff: 0,
          problemMatches: 0,
          multiDayTeams: 0,
        });
        multiDayTeamsByZone.set(match.tournament_group_id, new Set());
      }

      const metrics = zoneMetrics.get(match.tournament_group_id)!;
      const diffInfo = matchTimeDiffs.get(match.id) ?? { minDiff: null, maxDiff: null, teamWithMaxDiff: null, team1MaxDiff: null, team2MaxDiff: null };
      const multiDayInfo = matchMultiDayInfo.get(match.id) ?? { team1PlaysMultipleDays: false, team2PlaysMultipleDays: false };

      if (diffInfo.maxDiff !== null) {
        metrics.totalMaxDiff += diffInfo.maxDiff;
        metrics.countMaxDiff++;
      }
      if (diffInfo.minDiff !== null) {
        metrics.totalMinDiff += diffInfo.minDiff;
        metrics.countMinDiff++;
      }

      // Contar matches problemáticos
      if (diffInfo.minDiff !== null && (diffInfo.minDiff <= 60 || diffInfo.minDiff > 240)) {
        metrics.problemMatches++;
      }

      // Agregar equipos únicos que juegan en múltiples días al Set de la zona
      if (match.team1?.id && multiDayInfo.team1PlaysMultipleDays) {
        multiDayTeamsByZone.get(match.tournament_group_id)!.add(match.team1.id);
      }
      if (match.team2?.id && multiDayInfo.team2PlaysMultipleDays) {
        multiDayTeamsByZone.get(match.tournament_group_id)!.add(match.team2.id);
      }
    });

    // Calcular promedios por zona y asignar el conteo de equipos únicos
    zoneMetrics.forEach((metrics, groupId) => {
      metrics.avgMaxDiff = metrics.countMaxDiff > 0 ? metrics.totalMaxDiff / metrics.countMaxDiff : 0;
      metrics.avgMinDiff = metrics.countMinDiff > 0 ? metrics.totalMinDiff / metrics.countMinDiff : 0;
      metrics.multiDayTeams = multiDayTeamsByZone.get(groupId)?.size ?? 0;
    });

    // 3. Otras métricas
    const teamsWithMultipleDays = new Set<number>();
    scheduledMatches.forEach((match) => {
      if (!match.team1?.id || !match.team2?.id || !match.match_date) return;
      const multiDayInfo = matchMultiDayInfo.get(match.id) ?? { team1PlaysMultipleDays: false, team2PlaysMultipleDays: false };
      if (multiDayInfo.team1PlaysMultipleDays) teamsWithMultipleDays.add(match.team1.id);
      if (multiDayInfo.team2PlaysMultipleDays) teamsWithMultipleDays.add(match.team2.id);
    });

    const problemMatchesCount = Array.from(matchTimeDiffs.values()).filter(
      ({ minDiff }) => minDiff !== null && (minDiff <= 60 || minDiff > 240)
    ).length;

    // Distribución por día
    const matchesByDay = new Map<string, number>();
    scheduledMatches.forEach((match) => {
      if (match.match_date) {
        matchesByDay.set(match.match_date, (matchesByDay.get(match.match_date) || 0) + 1);
      }
    });

    return {
      totalMaxDiff,
      avgMaxDiff: countMaxDiff > 0 ? totalMaxDiff / countMaxDiff : 0,
      zoneMetrics: Array.from(zoneMetrics.entries()).map(([groupId, metrics]) => ({
        groupId,
        ...metrics,
      })),
      teamsWithMultipleDays: teamsWithMultipleDays.size,
      problemMatchesCount,
      matchesByDay: Array.from(matchesByDay.entries()).map(([date, count]) => ({ date, count })),
    };
  }, [matchTimeDiffs, scheduledMatches, groupMap, matchMultiDayInfo]);


  const handleSelectRow = (rowKey: string) => {
    if (selectedRow1 === null) {
      setSelectedRow1(rowKey);
    } else if (selectedRow1 === rowKey) {
      setSelectedRow1(null);
    } else if (selectedRow2 === null) {
      setSelectedRow2(rowKey);
    } else if (selectedRow2 === rowKey) {
      setSelectedRow2(null);
    } else {
      // Reemplazar la primera selección
      setSelectedRow1(rowKey);
      setSelectedRow2(null);
    }
  };

  const handleSwapSchedules = async () => {
    if (!selectedRow1 || !selectedRow2) return;

    const row1 = scheduleRows.find((r) => r.key === selectedRow1);
    const row2 = scheduleRows.find((r) => r.key === selectedRow2);
    if (!row1 || !row2) return;

    const matchRows = [row1, row2].filter((r): r is Extract<ScheduleRow, { type: "match" }> => r.type === "match");
    const freeRows = [row1, row2].filter((r): r is Extract<ScheduleRow, { type: "free" }> => r.type === "free");

    if (matchRows.length === 0) {
      alert("Seleccioná al menos un partido para mover o intercambiar");
      return;
    }

    try {
      setSwapping(true);

      if (matchRows.length === 2) {
        const match1 = matchRows[0].match;
        const match2 = matchRows[1].match;

        // Guardar estado anterior para undo
        setLastSwap({
          match1Id: match1.id,
          match2Id: match2.id,
          match1Original: {
            date: match1.match_date!,
            start_time: match1.start_time!,
            end_time: match1.end_time || null,
            court_id: match1.court_id ?? null,
          },
          match2Original: {
            date: match2.match_date!,
            start_time: match2.start_time!,
            end_time: match2.end_time || null,
            court_id: match2.court_id ?? null,
          },
        });

        await Promise.all([
          tournamentMatchesService.scheduleMatch(match1.id, {
            date: match2.match_date!,
            start_time: match2.start_time!,
            end_time: match2.end_time || undefined,
            court_id: match2.court_id ?? null,
          }),
          tournamentMatchesService.scheduleMatch(match2.id, {
            date: match1.match_date!,
            start_time: match1.start_time!,
            end_time: match1.end_time || undefined,
            court_id: match1.court_id ?? null,
          }),
        ]);
      } else if (matchRows.length === 1 && freeRows.length === 1) {
        const match = matchRows[0].match;
        const freeSlot = freeRows[0];

        setLastSwap({
          match1Id: match.id,
          match2Id: match.id,
          match1Original: {
            date: match.match_date!,
            start_time: match.start_time!,
            end_time: match.end_time || null,
            court_id: match.court_id ?? null,
          },
          match2Original: {
            date: match.match_date!,
            start_time: match.start_time!,
            end_time: match.end_time || null,
            court_id: match.court_id ?? null,
          },
        });

        await tournamentMatchesService.scheduleMatch(match.id, {
          date: freeSlot.slotDate,
          start_time: freeSlot.startTime,
          end_time: freeSlot.endTime || undefined,
          court_id: freeSlot.courtId ?? null,
        });
      } else {
        alert("Seleccioná dos partidos o un partido y un slot libre");
        return;
      }

      // Limpiar selección
      setSelectedRow1(null);
      setSelectedRow2(null);

      // Invalidar cache y recargar
      queryClient.invalidateQueries({ queryKey: ["tournament-groups", tournamentId] });
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al intercambiar horarios");
      setLastSwap(null); // Limpiar undo si hay error
    } finally {
      setSwapping(false);
    }
  };

  const handleUndoSwap = async () => {
    if (!lastSwap) return;

    try {
      setSwapping(true);
      
      // Restaurar horarios originales
      await Promise.all([
        tournamentMatchesService.scheduleMatch(lastSwap.match1Id, {
          date: lastSwap.match1Original.date,
          start_time: lastSwap.match1Original.start_time,
          end_time: lastSwap.match1Original.end_time || undefined,
          court_id: lastSwap.match1Original.court_id,
        }),
        tournamentMatchesService.scheduleMatch(lastSwap.match2Id, {
          date: lastSwap.match2Original.date,
          start_time: lastSwap.match2Original.start_time,
          end_time: lastSwap.match2Original.end_time || undefined,
          court_id: lastSwap.match2Original.court_id,
        }),
      ]);

      // Limpiar estado de undo
      setLastSwap(null);

      // Invalidar cache y recargar
      queryClient.invalidateQueries({ queryKey: ["tournament-groups", tournamentId] });
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al deshacer intercambio");
    } finally {
      setSwapping(false);
    }
  };

  const handleCancelSelection = () => {
    setSelectedRow1(null);
    setSelectedRow2(null);
  };

  const handleSwapGroups = async () => {
    if (!selectedGroup1 || !selectedGroup2) return;

    try {
      setSwapping(true);
      await tournamentMatchesService.swapGroups(tournamentId, selectedGroup1, selectedGroup2);
      
      // Limpiar selección
      setSelectedGroup1(null);
      setSelectedGroup2(null);

      // Invalidar cache y recargar
      queryClient.invalidateQueries({ queryKey: ["tournament-groups", tournamentId] });
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al intercambiar zonas");
    } finally {
      setSwapping(false);
    }
  };

  const handleSwapTeams = async () => {
    if (!selectedTeam1 || !selectedTeam2) return;
    if (
      fixedHeadTeamIds.has(selectedTeam1.teamId) ||
      fixedHeadTeamIds.has(selectedTeam2.teamId)
    ) {
      alert("Los cabeza de zona están fijados y no pueden intercambiarse.");
      return;
    }

    try {
      setSwapping(true);
      await tournamentMatchesService.swapTeams(
        tournamentId,
        selectedTeam1.teamId,
        selectedTeam1.groupId,
        selectedTeam2.teamId,
        selectedTeam2.groupId
      );
      
      // Limpiar selección
      setSelectedTeam1(null);
      setSelectedTeam2(null);

      // Invalidar cache y recargar
      queryClient.invalidateQueries({ queryKey: ["tournament-groups", tournamentId] });
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al intercambiar equipos");
    } finally {
      setSwapping(false);
    }
  };

  const handleDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Limpiar selección y undo al cerrar
      setSelectedRow1(null);
      setSelectedRow2(null);
      setSelectedGroup1(null);
      setSelectedGroup2(null);
      setSelectedTeam1(null);
      setSelectedTeam2(null);
      setLastSwap(null);
      setMode("matches");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisar y editar horarios de partidos</DialogTitle>
          <DialogDescription>
            Seleccioná partidos, zonas o equipos para intercambiar sus horarios. En la tabla de partidos también se muestran los slots libres para poder mover un partido a un horario disponible sin partido asignado. La métrica muestra la diferencia mínima de tiempo entre partidos del mismo equipo en el mismo día. Las filas en rojo indican que el horario asignado no respeta la restricción de algún equipo. En zonas de cuatro, los partidos de ronda de ganadores o perdedores se marcan si el horario no sirve para alguno de los cuatro equipos (cualquiera puede llegar a ese cruce).
          </DialogDescription>
        </DialogHeader>

        {/* Resumen de métricas */}
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
          <h3 className="text-sm font-semibold">Métricas del scheduling</h3>
          
          {/* Métricas generales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Suma diff máx.</div>
              <div className="text-lg font-semibold">{formatTimeDiff(scheduleMetrics.totalMaxDiff)}</div>
              <div className="text-xs text-muted-foreground">Promedio: {formatTimeDiff(scheduleMetrics.avgMaxDiff)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Partidos problemáticos</div>
              <div className="text-lg font-semibold">{scheduleMetrics.problemMatchesCount}</div>
              <div className="text-xs text-muted-foreground">(&lt; 1h o &gt; 4h)</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Equipos multi-día</div>
              <div className="text-lg font-semibold">{scheduleMetrics.teamsWithMultipleDays}</div>
              <div className="text-xs text-muted-foreground">Juegan en varios días</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Días con partidos</div>
              <div className="text-lg font-semibold">{scheduleMetrics.matchesByDay.length}</div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {scheduleMetrics.matchesByDay.slice(0, 3).map(({ date, count }) => (
                  <div key={date}>
                    {(() => {
                      const d = parseLocalDate(date);
                      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                      return `${dayNames[d.getDay()]}: ${count} partidos`;
                    })()}
                  </div>
                ))}
                {scheduleMetrics.matchesByDay.length > 3 && (
                  <div>+{scheduleMetrics.matchesByDay.length - 3} más</div>
                )}
              </div>
            </div>
          </div>

          {/* Métricas por zona */}
          {scheduleMetrics.zoneMetrics.length > 0 && (
            <div className="space-y-2 mt-4 pt-4 border-t">
              <h4 className="text-xs font-semibold">Métricas por zona</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scheduleMetrics.zoneMetrics.map((zone) => {
                  const groupInfo = groupMap.get(zone.groupId);
                  const groupColor = groupInfo
                    ? getGroupColor(groupInfo.index)
                    : { badgeBg: "bg-gray-200", badgeText: "text-gray-800" };
                  
                  return (
                    <div key={zone.groupId} className={`p-3 rounded-lg border ${groupColor.badgeBg} ${groupColor.badgeText} border-opacity-50`}>
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={`${groupColor.badgeBg} ${groupColor.badgeText} border-0`}>
                          {zone.groupName}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prom. diff máx:</span>
                          <span className="font-medium">{formatTimeDiff(zone.avgMaxDiff)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prom. diff mín:</span>
                          <span className="font-medium">{formatTimeDiff(zone.avgMinDiff)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Problemáticos:</span>
                          <span className={`font-medium ${zone.problemMatches > 0 ? 'text-red-600' : ''}`}>
                            {zone.problemMatches}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Multi-día:</span>
                          <span className="font-medium">{zone.multiDayTeams} equipos</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "matches" | "groups" | "teams")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="matches">Intercambiar partidos</TabsTrigger>
            <TabsTrigger value="groups">Intercambiar zonas</TabsTrigger>
            <TabsTrigger value="teams">Intercambiar equipos</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="space-y-4 mt-4">
          <TooltipProvider>
          {/* Barra de acciones para selección */}
          {(selectedRow1 || selectedRow2) && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-blue-900">
                {selectedRow1 && selectedRow2
                  ? "2 elementos seleccionados. Podés intercambiar partidos o mover un partido a un slot libre."
                  : "1 elemento seleccionado. Seleccioná otro para intercambiar o mover."}
              </span>
              {selectedRow1 && selectedRow2 && (
                <>
                  <Button
                    size="sm"
                    onClick={handleSwapSchedules}
                    disabled={swapping}
                    className="ml-auto"
                  >
                    {swapping ? (
                      <>
                        <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
                        Intercambiando...
                      </>
                    ) : (
                      <>
                        <ArrowLeftRightIcon className="h-3 w-3 mr-1" />
                        Intercambiar horarios
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelSelection}
                    disabled={swapping}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Barra de acciones para undo */}
          {lastSwap && !selectedRow1 && !selectedRow2 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-sm font-medium text-amber-900">
                Último intercambio realizado. ¿Deshacer?
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUndoSwap}
                disabled={swapping}
                className="ml-auto bg-white hover:bg-amber-100"
              >
                {swapping ? (
                  <>
                    <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
                    Deshaciendo...
                  </>
                ) : (
                  <>
                    <UndoIcon className="h-3 w-3 mr-1" />
                    Deshacer
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLastSwap(null)}
                disabled={swapping}
              >
                <XIcon className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Tabla de partidos */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Sel.</TableHead>
                  <TableHead className="w-24 min-w-[100px]">Grupo</TableHead>
                  <TableHead>Equipo 1</TableHead>
                  <TableHead>Equipo 2</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead className="text-right">Diff. mín. (mismo equipo)</TableHead>
                  <TableHead className="text-right">Diff. máx. (mismo equipo)</TableHead>
                  <TableHead className="text-center">Juega en días diferentes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No hay slots ni partidos para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  scheduleRows.map((rowItem) => {
                    const isSelected1 = selectedRow1 === rowItem.key;
                    const isSelected2 = selectedRow2 === rowItem.key;
                    const isSelected = isSelected1 || isSelected2;
                    const match = rowItem.type === "match" ? rowItem.match : null;
                    const diffInfo = match
                      ? matchTimeDiffs.get(match.id) ?? { minDiff: null, maxDiff: null, teamWithMaxDiff: null, team1MaxDiff: null, team2MaxDiff: null }
                      : { minDiff: null, maxDiff: null, teamWithMaxDiff: null, team1MaxDiff: null, team2MaxDiff: null };
                    const minDiff = diffInfo.minDiff;
                    const maxDiff = diffInfo.maxDiff;
                    const team1MaxDiff = diffInfo.team1MaxDiff;
                    const team2MaxDiff = diffInfo.team2MaxDiff;
                    const multiDayInfo = match
                      ? matchMultiDayInfo.get(match.id) ?? { team1PlaysMultipleDays: false, team2PlaysMultipleDays: false }
                      : { team1PlaysMultipleDays: false, team2PlaysMultipleDays: false };
                    const hasMultiDayTeam = multiDayInfo.team1PlaysMultipleDays || multiDayInfo.team2PlaysMultipleDays;
                    const groupInfo = match?.tournament_group_id
                      ? groupMap.get(match.tournament_group_id)
                      : null;
                    const groupName = rowItem.type === "free" ? "Slot libre" : groupInfo?.name || "Sin grupo";
                    const groupColor = groupInfo
                      ? getGroupColor(groupInfo.index)
                      : { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200", badgeBg: "bg-gray-200", badgeText: "text-gray-800" };

                    const slotViolation = match ? matchSlotViolation.get(match.id) : undefined;
                    const violatesSlotRestriction =
                      !!slotViolation &&
                      (slotViolation.team1 ||
                        slotViolation.team2 ||
                        (slotViolation.round2TeamsCantPlay?.length ?? 0) > 0);
                    const restrictionTooltip =
                      slotViolation &&
                      (() => {
                        if (slotViolation.round2TeamsCantPlay?.length) {
                          const names = slotViolation.round2TeamsCantPlay.map((t) =>
                            teamShortLabel(t)
                          );
                          return `${names.join(", ")} no pueden en este horario. En la ronda de ganadores o perdedores puede tocarle a cualquiera de los cuatro equipos de la zona.`;
                        }
                        if (!match) return "";
                        const parts: string[] = [];
                        if (slotViolation.team1) parts.push(teamLabel(match.team1, match.match_order, true));
                        if (slotViolation.team2) parts.push(teamLabel(match.team2, match.match_order, false));
                        return parts.length ? `${parts.join(" y ")} no pueden en este horario` : "";
                      })();
                    const row = (
                      <TableRow
                        key={rowItem.key}
                        className={`cursor-pointer ${
                          violatesSlotRestriction
                            ? "bg-red-100 hover:bg-red-200"
                            : rowItem.type === "free"
                              ? "bg-emerald-50 hover:bg-emerald-100"
                            : isSelected
                              ? "bg-blue-50 hover:bg-blue-100"
                              : "hover:bg-muted/50"
                        }`}
                        onClick={() => handleSelectRow(rowItem.key)}
                      >
                        <TableCell>
                          {isSelected && (
                            <div className="flex items-center justify-center">
                              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                <CheckIcon className="h-3 w-3 text-white" />
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge className={`${groupColor.badgeBg} ${groupColor.badgeText} border-0`}>
                              {groupName}
                            </Badge>
                            {slotViolation?.round2TeamsCantPlay &&
                              slotViolation.round2TeamsCantPlay.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-destructive/60 text-destructive bg-destructive/10"
                                >
                                  Ronda 2: revisar 4 equipos
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className={`font-medium ${
                          multiDayInfo.team1PlaysMultipleDays ? 'bg-red-100 text-red-800 font-bold' :
                          team1MaxDiff !== null ? getTeamHighlightClass(team1MaxDiff) : 
                          (minDiff !== null) ? getTeamHighlightClass(minDiff) : ''
                        }`}>
                          {match ? teamLabel(match.team1, match.match_order, true) : "—"}
                        </TableCell>
                        <TableCell className={`font-medium ${
                          multiDayInfo.team2PlaysMultipleDays ? 'bg-red-100 text-red-800 font-bold' :
                          team2MaxDiff !== null ? getTeamHighlightClass(team2MaxDiff) : 
                          (minDiff !== null) ? getTeamHighlightClass(minDiff) : ''
                        }`}>
                          {match ? teamLabel(match.team2, match.match_order, false) : "—"}
                        </TableCell>
                        <TableCell>
                          {rowItem.slotDate ? (
                            (() => {
                              const date = parseLocalDate(rowItem.slotDate);
                              const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                              const dayName = dayNames[date.getDay()].toUpperCase();
                              return `${dayName} ${formatDate(rowItem.slotDate)}`;
                            })()
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {rowItem.startTime ? (
                            <>
                              {formatTime(rowItem.startTime)}
                              {rowItem.type === "free" &&
                                rowItem.courtId != null &&
                                (courtMap.has(rowItem.courtId) ? (
                                  <span className="text-muted-foreground ml-1">
                                    - {courtMap.get(rowItem.courtId)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground ml-1">
                                    - Cancha #{rowItem.courtId}
                                  </span>
                                ))}
                              {rowItem.type === "match" && match?.court_id != null && (
                                <span className="text-muted-foreground ml-1">
                                  - {courtMap.get(match.court_id) ?? `Cancha #${match.court_id}`}
                                </span>
                              )}
                            </>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {minDiff !== null ? (
                            <Badge
                              variant={
                                minDiff <= 60 || minDiff > 240 ? "destructive" : // <= 1h o > 4h: rojo
                                minDiff === 240 ? "default" : // 4 horas exactas: amarillo
                                "secondary" // otros valores
                              }
                              className={
                                minDiff <= 60 || minDiff > 240 ? "" : // rojo (destructive)
                                minDiff === 240 ? "bg-yellow-100 text-yellow-800 border-yellow-200" : // amarillo para 4h
                                minDiff >= 120 && minDiff <= 180 ? "bg-green-100 text-green-800 border-green-200" : "" // verde para 2-3h (incluyendo 180 min = 3h)
                              }
                            >
                              {formatTimeDiff(minDiff)}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {maxDiff !== null ? (
                            <Badge
                              variant={
                                maxDiff <= 60 || maxDiff > 240 ? "destructive" : // <= 1h o > 4h: rojo
                                maxDiff === 240 ? "default" : // 4 horas exactas: amarillo
                                "secondary" // otros valores
                              }
                              className={
                                maxDiff <= 60 || maxDiff > 240 ? "" : // rojo (destructive)
                                maxDiff === 240 ? "bg-yellow-100 text-yellow-800 border-yellow-200" : // amarillo para 4h
                                maxDiff >= 120 && maxDiff <= 180 ? "bg-green-100 text-green-800 border-green-200" : "" // verde para 2-3h (incluyendo 180 min = 3h)
                              }
                            >
                              {formatTimeDiff(maxDiff)}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {hasMultiDayTeam ? (
                            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                              Sí
                              {multiDayInfo.team1PlaysMultipleDays && multiDayInfo.team2PlaysMultipleDays && " (ambos)"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                              No
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                    return restrictionTooltip ? (
                      <Tooltip key={rowItem.key}>
                        <TooltipTrigger asChild>{row}</TooltipTrigger>
                        <TooltipContent>{restrictionTooltip}</TooltipContent>
                      </Tooltip>
                    ) : (
                      row
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          </TooltipProvider>
          </TabsContent>

          <TabsContent value="groups" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Zona 1</label>
                  <Select
                    value={selectedGroup1?.toString() || ""}
                    onValueChange={(v) => setSelectedGroup1(Number(v))}
                    disabled={swapping}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar zona" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Zona 2</label>
                  <Select
                    value={selectedGroup2?.toString() || ""}
                    onValueChange={(v) => setSelectedGroup2(Number(v))}
                    disabled={swapping}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar zona" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedGroups
                        .filter((g) => g.id !== selectedGroup1)
                        .map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedGroup1 && selectedGroup2 && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-sm font-medium text-blue-900">
                    ¿Intercambiar horarios de {groupMap.get(selectedGroup1)?.name} y {groupMap.get(selectedGroup2)?.name}?
                  </span>
                  <Button
                    size="sm"
                    onClick={handleSwapGroups}
                    disabled={swapping}
                    className="ml-auto"
                  >
                    {swapping ? (
                      <>
                        <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
                        Intercambiando...
                      </>
                    ) : (
                      <>
                        <FolderIcon className="h-3 w-3 mr-1" />
                        Intercambiar zonas
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedGroup1(null);
                      setSelectedGroup2(null);
                    }}
                    disabled={swapping}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                <p>Seleccioná 2 zonas para intercambiar todos los horarios de sus partidos.</p>
                <p className="mt-1">Ambas zonas deben tener la misma cantidad de equipos.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="teams" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Equipo 1</label>
                  <Select
                    value={selectedTeam1 ? `${selectedTeam1.groupId}-${selectedTeam1.teamId}` : ""}
                    onValueChange={(v) => {
                      const [groupId, teamId] = v.split("-").map(Number);
                      setSelectedTeam1({ teamId, groupId });
                    }}
                    disabled={swapping}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar equipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedGroups.map((group) => {
                        const groupTeams = teamsList.filter((t) => t.groupId === group.id);
                        if (groupTeams.length === 0) return null;
                        return (
                          <div key={group.id}>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                              {group.name}
                            </div>
                            {groupTeams.map(({ team }) => (
                              <SelectItem
                                key={team.id}
                                value={`${group.id}-${team.id}`}
                                disabled={fixedHeadTeamIds.has(team.id)}
                              >
                                {teamLabel(team)}
                                {fixedHeadTeamIds.has(team.id) ? " (cabeza fijo)" : ""}
                              </SelectItem>
                            ))}
                          </div>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Equipo 2</label>
                  <Select
                    value={selectedTeam2 ? `${selectedTeam2.groupId}-${selectedTeam2.teamId}` : ""}
                    onValueChange={(v) => {
                      const [groupId, teamId] = v.split("-").map(Number);
                      setSelectedTeam2({ teamId, groupId });
                    }}
                    disabled={swapping}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar equipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedGroups.map((group) => {
                        const groupTeams = teamsList.filter((t) => t.groupId === group.id);
                        if (groupTeams.length === 0) return null;
                        // Filtrar el equipo seleccionado en equipo 1
                        const filteredTeams = groupTeams.filter(
                          (t) => !selectedTeam1 || t.team.id !== selectedTeam1.teamId || t.groupId !== selectedTeam1.groupId
                        );
                        if (filteredTeams.length === 0) return null;
                        return (
                          <div key={group.id}>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                              {group.name}
                            </div>
                            {filteredTeams.map(({ team }) => (
                              <SelectItem
                                key={team.id}
                                value={`${group.id}-${team.id}`}
                                disabled={fixedHeadTeamIds.has(team.id)}
                              >
                                {teamLabel(team)}
                                {fixedHeadTeamIds.has(team.id) ? " (cabeza fijo)" : ""}
                              </SelectItem>
                            ))}
                          </div>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedTeam1 && selectedTeam2 && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-sm font-medium text-blue-900">
                    ¿Intercambiar {teamLabel(teamsList.find((t) => t.team.id === selectedTeam1.teamId)?.team || null)} ({groupMap.get(selectedTeam1.groupId)?.name}) con {teamLabel(teamsList.find((t) => t.team.id === selectedTeam2.teamId)?.team || null)} ({groupMap.get(selectedTeam2.groupId)?.name})?
                  </span>
                  <Button
                    size="sm"
                    onClick={handleSwapTeams}
                    disabled={swapping}
                    className="ml-auto"
                  >
                    {swapping ? (
                      <>
                        <Loader2Icon className="h-3 w-3 animate-spin mr-1" />
                        Intercambiando...
                      </>
                    ) : (
                      <>
                        <UsersIcon className="h-3 w-3 mr-1" />
                        Intercambiar equipos
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedTeam1(null);
                      setSelectedTeam2(null);
                    }}
                    disabled={swapping}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                <p>Seleccioná 2 equipos para intercambiar sus horarios y zonas.</p>
                <p className="mt-1">Ambos equipos deben tener la misma cantidad de partidos.</p>
                <p className="mt-1 text-amber-700">
                  Los cabeza de zona (primer orden de inscripcion por zona) están fijados y no pueden intercambiarse.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

