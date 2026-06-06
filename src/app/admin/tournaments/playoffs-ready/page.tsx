"use client";

import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, ExternalLinkIcon, TrophyIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TournamentDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import GroupsTab from "../[id]/GroupsTab";

type ReadyTournament = Pick<
  TournamentDTO,
  "id" | "name" | "match_duration" | "match_duration_quarters_onwards" | "status" | "has_super_tiebreak"
>;

export default function GlobalPlayoffsReadyPage() {
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

  const maxPlayoffDuration = useMemo(() => {
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
  }, [tournaments]);

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
            La generación en conjunto de horarios de eliminatoria se hará desde acá (próximo paso).
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <Button
              type="button"
              disabled={tournaments.length === 0}
              onClick={() =>
                toast.message(
                  "Próximamente: un solo diálogo de horarios para generar playoffs de todos los torneos listos."
                )
              }
            >
              <TrophyIcon className="h-4 w-4 mr-2" />
              Generar playoffs en conjunto
            </Button>
            {tournaments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {tournaments.length} torneo(s) listo(s) · duración playoff ref. {maxPlayoffDuration} min
              </p>
            )}
          </div>
        </CardHeader>
      </Card>

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
