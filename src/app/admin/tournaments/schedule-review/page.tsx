"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, ExternalLinkIcon, CalendarCogIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TournamentScheduleDialog } from "@/components/tournament-schedule-dialog";
import type { TournamentDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import ScheduleReviewTab from "../[id]/ScheduleReviewTab";

type ReviewTournament = Pick<TournamentDTO, "id" | "name" | "match_duration" | "status">;

export default function GlobalScheduleReviewPage() {
  const queryClient = useQueryClient();
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<ReviewTournament[]>({
    queryKey: ["tournaments", "global-schedule-review"],
    queryFn: async () => {
      const tournaments = await tournamentsService.getAll(["schedule_review"]);
      return tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        match_duration: tournament.match_duration,
        status: tournament.status,
      }));
    },
    staleTime: 1000 * 30,
  });

  const tournaments = data ?? [];

  const maxScheduleReviewDuration = useMemo(() => {
    if (tournaments.length === 0) return 60;
    return Math.max(
      60,
      ...tournaments.map((t) => Math.max(30, Number(t.match_duration) || 60))
    );
  }, [tournaments]);

  const handleGlobalScheduleConfirm = () => {
    void queryClient.invalidateQueries({
      queryKey: ["tournaments", "global-schedule-review"],
    });
    void queryClient.invalidateQueries({ queryKey: ["tournament-groups"] });
    void queryClient.invalidateQueries({ queryKey: ["tournament"] });
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
          <CardTitle>Revisión global de horarios</CardTitle>
          <CardDescription>
            No se pudieron cargar los torneos en revisión de horarios.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-none p-0">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Revisión global de horarios</CardTitle>
          <CardDescription>
            Gestioná desde un solo lugar todos los torneos que están en revisión de horarios.
          </CardDescription>
          <div className="flex items-center gap-2 pt-3">
            <Button
              type="button"
              onClick={() => setGlobalDialogOpen(true)}
              disabled={tournaments.length === 0}
            >
              <CalendarCogIcon className="h-4 w-4 mr-2" />
              Generar horarios en conjunto
            </Button>
          </div>
        </CardHeader>
      </Card>

      <TournamentScheduleDialog
        open={globalDialogOpen}
        onOpenChange={setGlobalDialogOpen}
        onConfirm={handleGlobalScheduleConfirm}
        matchCount={0}
        tournamentMatchDuration={maxScheduleReviewDuration}
        globalScheduleReview
        showLogs
      />

      {tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay torneos en estado de revisión de horarios.
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
                    <CardDescription>Torneo #{tournament.id}</CardDescription>
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
                <ScheduleReviewTab tournament={tournament} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
