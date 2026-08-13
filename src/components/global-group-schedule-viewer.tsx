"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2Icon } from "lucide-react";
import { toHHMM } from "@/lib/build-schedule-days-from-slots";
import type { GroupDTO, MatchDTO, TournamentGroupSlotSummary } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import { GroupScheduleViewer } from "@/components/group-schedule-viewer";
import type { GroupSchedulePreviewTournament } from "@/components/group-schedule-preview";

type GlobalGroupScheduleViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentIds: number[];
  onScheduleUpdated?: () => void;
};

function mergeTournamentPreviewData(tournaments: GroupSchedulePreviewTournament[]) {
  const tournamentNameByGroupId = new Map<number, string>();
  const allGroups: GroupDTO[] = [];
  const allMatches: MatchDTO[] = [];
  const slotWindows = new Map<string, TournamentGroupSlotSummary>();
  const courtIds = new Set<number>();

  for (const t of tournaments) {
    for (const g of t.groups) {
      allGroups.push(g);
      tournamentNameByGroupId.set(g.id, t.name);
    }
    allMatches.push(...t.matches);

    for (const slot of t.tournamentGroupSlots ?? []) {
      const key = `${String(slot.slot_date).trim().slice(0, 10)}\t${toHHMM(slot.start_time)}\t${toHHMM(slot.end_time ?? "")}`;
      if (!slotWindows.has(key)) {
        slotWindows.set(key, {
          ...slot,
          end_time: slot.end_time ?? "",
        });
      }
    }

    for (const id of t.groupScheduleCourtIds ?? []) {
      if (Number.isFinite(id)) courtIds.add(id);
    }
    for (const m of t.matches) {
      if (m.court_id != null) courtIds.add(m.court_id);
    }
  }

  return {
    groups: allGroups,
    matches: allMatches,
    tournamentGroupSlots: Array.from(slotWindows.values()),
    groupScheduleCourtIds: Array.from(courtIds).sort((a, b) => a - b),
    tournamentNameByGroupId,
  };
}

export function GlobalGroupScheduleViewer({
  open,
  onOpenChange,
  tournamentIds,
  onScheduleUpdated,
}: GlobalGroupScheduleViewerProps) {
  const idsKey = tournamentIds.join(",");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["groups-schedule-preview", idsKey],
    queryFn: () =>
      tournamentsService.getGroupsSchedulePreview(
        idsKey ? `?ids=${idsKey}` : ""
      ),
    enabled: open && tournamentIds.length > 0,
    staleTime: 1000 * 15,
  });

  const merged = useMemo(
    () => mergeTournamentPreviewData(data?.tournaments ?? []),
    [data?.tournaments]
  );

  if (!open) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisar y editar horarios en conjunto</DialogTitle>
            <DialogDescription>Cargando partidos de todos los torneos…</DialogDescription>
          </DialogHeader>
          <div className="h-[120px] flex items-center justify-center">
            <Loader2Icon className="h-7 w-7 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisar y editar horarios en conjunto</DialogTitle>
            <DialogDescription>
              No se pudieron cargar los horarios de los torneos seleccionados.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  if (merged.matches.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisar y editar horarios en conjunto</DialogTitle>
            <DialogDescription>
              No hay partidos programados para revisar. Generá los horarios en conjunto primero.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <GroupScheduleViewer
      open={open}
      onOpenChange={onOpenChange}
      matches={merged.matches}
      groups={merged.groups}
      tournamentId={tournamentIds[0]}
      invalidateTournamentIds={tournamentIds}
      globalMode
      tournamentNameByGroupId={merged.tournamentNameByGroupId}
      onScheduleUpdated={onScheduleUpdated}
      tournamentGroupSlots={merged.tournamentGroupSlots}
      groupScheduleCourtIds={merged.groupScheduleCourtIds}
    />
  );
}
