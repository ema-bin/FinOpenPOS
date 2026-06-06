"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, ExternalLinkIcon, TrophyIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TournamentScheduleDialog,
  type ScheduleConfig,
} from "@/components/tournament-schedule-dialog";
import type { TournamentDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import GroupsTab from "../[id]/GroupsTab";

type ReadyTournament = Pick<
  TournamentDTO,
  "id" | "name" | "match_duration" | "match_duration_quarters_onwards" | "status" | "has_super_tiebreak"
>;

export default function GlobalPlayoffsReadyPage() {
  const queryClient = useQueryClient();
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playoffsError, setPlayoffsError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<ReadyTournament[]>({
    queryKey: ["tournaments", "global-playoffs-ready"],
    queryFn: async () => {
      const tournaments = await tournamentsService.getAll(["playoffs_ready"]);
      return tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        match_duration: t.match_duration,
        match_duration_quarters_onwards: t.match_duration_quarters_onwards,
        status: t.status,
        has_super_tiebreak: t.has_super_tiebreak,
      }));
    },
    staleTime: 1000 * 30,
  });

  const tournaments = data ?? [];

  const { data: summary } = useQuery({
    queryKey: ["tournaments", "playoffs-ready-summary"],
    queryFn: () => tournamentsService.getPlayoffsReadySummary(),
    enabled: tournaments.length > 0,
    staleTime: 1000 * 30,
  });

  const maxPlayoffDuration = useMemo(() => {
    if (summary?.maxPlayoffDurationMinutes) {
      return summary.maxPlayoffDurationMinutes;
    }
    if (tournaments.length === 0) return 60;
    return Math.max(
      60,
      ...tournaments.map(
        (t) =>
          t.match_duration_quarters_onwards ??
          t.match_duration ??
          60
      )
    );
  }, [summary, tournaments]);

  const planErrors = useMemo(
    () => (summary?.tournaments ?? []).filter((t) => t.error),
    [summary]
  );

  const handleConfirmSchedule = async (config: ScheduleConfig) => {
    try {
      setGenerating(true);
      setPlayoffsError(null);
      const result = await tournamentsService.generateBulkPlayoffs(config);
      setGlobalDialogOpen(false);
      toast.success(
        `Playoffs generados: ${result.tournamentsProcessed} torneo(s), ${result.totalPlayoffMatches} partido(s)`
      );
      void queryClient.invalidateQueries({
        queryKey: ["tournaments", "global-playoffs-ready"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tournaments", "playoffs-ready-summary"],
      });
      window.location.reload();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al generar playoffs. Por favor, intentá nuevamente.";
      setPlayoffsError(message);
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[240px] flex items-center justify-center">
        <Loader2Icon className="h-7 w-7 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Playoffs global</CardTitle>
          <CardDescription>
            No se pudieron cargar los torneos listos para playoffs.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-none p-0">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Playoffs global</CardTitle>
          <CardDescription>
            Torneos con la fase de grupos finalizada y marcados como listos para playoffs.
            Definí los días de playoff y elegí ventanas por cancha una sola vez para todos los torneos listos.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <Button
              type="button"
              disabled={tournaments.length === 0 || planErrors.length > 0}
              onClick={() => setGlobalDialogOpen(true)}
            >
              <TrophyIcon className="h-4 w-4 mr-2" />
              Generar playoffs en conjunto
            </Button>
            {tournaments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {tournaments.length} torneo(s) listo(s)
                {summary
                  ? ` · ${summary.totalPlayoffMatches} partido(s) de playoff · duración ref. ${maxPlayoffDuration} min`
                  : ` · duración playoff ref. ${maxPlayoffDuration} min`}
              </p>
            )}
          </div>
          {planErrors.length > 0 && (
            <p className="text-xs text-destructive pt-2">
              No se puede generar en conjunto:{" "}
              {planErrors.map((t) => `"${t.name}" (${t.error})`).join("; ")}
            </p>
          )}
        </CardHeader>
      </Card>

      <TournamentScheduleDialog
        open={globalDialogOpen}
        onOpenChange={(open) => {
          setGlobalDialogOpen(open);
          if (!open) setPlayoffsError(null);
        }}
        onConfirm={handleConfirmSchedule}
        matchCount={summary?.totalPlayoffMatches ?? 0}
        tournamentMatchDuration={maxPlayoffDuration}
        tournamentMatchDurationQuartersOnwards={maxPlayoffDuration}
        globalPlayoffsReady
        error={playoffsError}
        isLoading={generating}
      />

      {tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay torneos en estado listo para playoffs. Marcá torneos desde{" "}
            <strong>Fase de grupos → Listo para playoffs</strong> cuando todos los partidos de zona estén
            finalizados.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {tournaments.map((tournament) => (
            <Card key={tournament.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{tournament.name}</CardTitle>
                    <CardDescription>Torneo #{tournament.id} · Listo para playoffs</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/tournaments/${tournament.id}`}>
                      Abrir torneo
                      <ExternalLinkIcon className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <GroupsTab tournament={tournament} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
