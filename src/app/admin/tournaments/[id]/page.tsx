"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Loader2Icon, EditIcon, EyeIcon, Share2Icon } from "lucide-react";
import TeamsTab from "./TeamsTab";
import PaymentsTab from "./PaymentsTab";
import ScheduleReviewTab from "./ScheduleReviewTab";
import GroupsTab from "./GroupsTab";
import StandingsTab from "./StandingsTab";
import PlayoffsTab from "./PlayoffsTab";
import PlayoffsViewTab from "./PlayoffsViewTab";
import ShareGroupScheduleTab from "./ShareGroupScheduleTab";
import ShareGroupStandingsTab from "./ShareGroupStandingsTab";
import ShareTournamentFlyerTab from "./ShareTournamentFlyerTab";
import PlayoffPreviewTab from "./PlayoffPreviewTab";
import type { TournamentDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";
import { toast } from "sonner";

async function fetchTournament(id: number): Promise<TournamentDTO> {
  return tournamentsService.getById(id);
}

export default function TournamentDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const [activeTab, setActiveTab] = useState<string>("teams");
  const [durationDialogOpen, setDurationDialogOpen] = useState(false);
  const [matchDuration, setMatchDuration] = useState<number>(60);
  const [matchDurationQuarters, setMatchDurationQuarters] = useState<number>(60);
  const queryClient = useQueryClient();

  const {
    data: tournament,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => fetchTournament(id),
    enabled: !!id && !Number.isNaN(id),
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const updateDurationMutation = useMutation({
    mutationFn: async () => {
      if (!id || Number.isNaN(id)) return;
      const sanitized = Math.max(30, Number(matchDuration) || 60);
      const sanitizedQuarters = Math.max(30, Number(matchDurationQuarters) || sanitized);
      return tournamentsService.update(id, {
        match_duration: sanitized,
        match_duration_quarters_onwards: sanitizedQuarters,
      });
    },
    onSuccess: () => {
      toast.success("Duración de partido actualizada.");
      setDurationDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["tournament", id] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la duración del partido."
      );
    },
  });


  if (!id || Number.isNaN(id)) {
    return <div>Invalid tournament id</div>;
  }

  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2Icon className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (isError || !tournament) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <div>Error al cargar el torneo</div>
      </div>
    );
  }

  return (
    <Card className="p-4 flex flex-col gap-4">
      <CardHeader className="p-0">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>
            {tournament.name}{" "}
            <span className="text-xs text-muted-foreground">
              {tournament.is_category_specific && tournament.category
                ? tournament.category
                : tournament.category ?? "Sin categoría"}
              {tournament.is_puntuable && " • Puntuable"}
              {" • "}
              {tournament.status}
            </span>
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setMatchDuration(tournament.match_duration ?? 60);
              setMatchDurationQuarters(
                tournament.match_duration_quarters_onwards ?? tournament.match_duration ?? 60
              );
              setDurationDialogOpen(true);
            }}
            disabled={tournament.status === "finished" || tournament.status === "cancelled"}
          >
            Duración: {tournament.match_duration ?? 60} /{" "}
            {tournament.match_duration_quarters_onwards ?? tournament.match_duration ?? 60} min
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="space-y-3">
            {/* Sección de edición */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
                <EditIcon className="h-3 w-3" />
                <span>Edición</span>
              </div>
              <TabsList className="w-full justify-start">
                <TabsTrigger 
                  value="teams"
                  disabled={tournament.status !== "draft"}
                >
                  Inscripción
                </TabsTrigger>
                <TabsTrigger 
                  value="payments"
                  disabled={tournament.status === "cancelled" || tournament.status === "finished"}
                >
                  Pagos
                </TabsTrigger>
                <TabsTrigger 
                  value="schedule-review" 
                  disabled={tournament.status !== "schedule_review"}
                >
                  Revisión de horarios
                </TabsTrigger>
                <TabsTrigger 
                  value="groups" 
                  disabled={tournament.status !== "in_progress"}
                >
                  Fase de grupos
                </TabsTrigger>
                <TabsTrigger 
                  value="playoffs" 
                  disabled={tournament.status !== "in_progress"}
                >
                  Playoffs
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Sección de vista */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
                <EyeIcon className="h-3 w-3" />
                <span>Vista</span>
              </div>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="standings">Tabla de posiciones</TabsTrigger>
                <TabsTrigger value="playoffs-view">Vista de playoffs</TabsTrigger>
                <TabsTrigger value="playoff-preview">Playoffs Preview</TabsTrigger>
              </TabsList>
            </div>

            {/* Sección de compartir */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1">
                <Share2Icon className="h-3 w-3" />
                <span>Compartir</span>
              </div>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="share-flyer">Flier Promoción</TabsTrigger>
                <TabsTrigger value="share-schedule">Horarios Grupos</TabsTrigger>
                <TabsTrigger value="share-standings-results">Resultados Grupos</TabsTrigger>
                <TabsTrigger value="share-playoffs">Playoffs</TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Solo renderizar el tab activo para evitar cargas innecesarias */}
          {activeTab === "teams" && (
            <TabsContent value="teams" className="pt-4">
              <TeamsTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "payments" && (
            <TabsContent value="payments" className="pt-4">
              <PaymentsTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "schedule-review" && (
            <TabsContent value="schedule-review" className="pt-4">
              <ScheduleReviewTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "groups" && (
            <TabsContent value="groups" className="pt-4">
              <GroupsTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "standings" && (
            <TabsContent value="standings" className="pt-4">
              <StandingsTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "playoffs" && (
            <TabsContent value="playoffs" className="pt-4">
              <PlayoffsTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "playoffs-view" && (
            <TabsContent value="playoffs-view" className="pt-4">
              <PlayoffsViewTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "playoff-preview" && (
            <TabsContent value="playoff-preview" className="pt-4">
              <PlayoffPreviewTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "share-flyer" && (
            <TabsContent value="share-flyer" className="pt-4">
              <ShareTournamentFlyerTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "share-schedule" && (
            <TabsContent value="share-schedule" className="pt-4">
              <ShareGroupScheduleTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "share-standings-results" && (
            <TabsContent value="share-standings-results" className="pt-4">
              <ShareGroupStandingsTab tournament={tournament} />
            </TabsContent>
          )}

          {activeTab === "share-playoffs" && (
            <TabsContent value="share-playoffs" className="pt-4">
              <div className="text-center py-8 text-muted-foreground">
                Próximamente: Compartir playoffs
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>

      <Dialog open={durationDialogOpen} onOpenChange={setDurationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar duración de partido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Zona, 16avos y octavos (minutos)</Label>
              <Input
                type="number"
                min={30}
                step={5}
                value={matchDuration}
                onChange={(e) => setMatchDuration(Math.max(30, Number(e.target.value) || 60))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cuartos en adelante (minutos)</Label>
              <Input
                type="number"
                min={30}
                step={5}
                value={matchDurationQuarters}
                onChange={(e) =>
                  setMatchDurationQuarters(Math.max(30, Number(e.target.value) || 60))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              La primera duración aplica a fase de zona y primeras rondas de playoff; la segunda a
              cuartos, semifinal y final.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDurationDialogOpen(false)}
              disabled={updateDurationMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => updateDurationMutation.mutate()}
              disabled={updateDurationMutation.isPending}
            >
              {updateDurationMutation.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
