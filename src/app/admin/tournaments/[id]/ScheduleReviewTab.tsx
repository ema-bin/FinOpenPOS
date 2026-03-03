"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CheckIcon, RefreshCwIcon, TrashIcon, ArrowLeftRightIcon } from "lucide-react";
import { GroupScheduleViewer } from "@/components/group-schedule-viewer";
import { TournamentScheduleDialog } from "@/components/tournament-schedule-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TournamentDTO, GroupsApiResponse, AvailableSchedule, GroupDTO, GroupTeamDTO, TeamDTO } from "@/models/dto/tournament";
import { tournamentsService } from "@/services";

function teamLabelShort(team: TeamDTO | null): string {
  if (!team) return "—";
  if (team.display_name?.trim()) return team.display_name.trim();
  const ln1 = team.player1?.last_name ?? "";
  const ln2 = team.player2?.last_name ?? "";
  return [ln1, ln2].filter(Boolean).join("–") || `Equipo ${team.id}`;
}

type SwapEntry = { teamId: number; groupId: number; groupName: string; label: string };

async function fetchTournamentGroups(tournamentId: number): Promise<GroupsApiResponse> {
  return tournamentsService.getGroups(tournamentId);
}

export default function ScheduleReviewTab({
  tournament,
}: {
  tournament: Pick<TournamentDTO, "id" | "match_duration" | "status">;
}) {
  const queryClient = useQueryClient();
  const [showScheduleViewer, setShowScheduleViewer] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [closingReview, setClosingReview] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCloseReviewDialog, setShowCloseReviewDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapFirst, setSwapFirst] = useState<SwapEntry | null>(null);
  const [swapSecond, setSwapSecond] = useState<SwapEntry | null>(null);

  const {
    data,
    isLoading: loading,
    refetch: refetchGroups,
  } = useQuery({
    queryKey: ["tournament-groups", tournament.id],
    queryFn: () => fetchTournamentGroups(tournament.id),
    staleTime: 1000 * 30,
  });

  // Los horarios disponibles ahora se generan en memoria durante la revisión de horarios
  const availableSchedulesGrouped: AvailableSchedule[] = [];

  const groupsWithTeams = useMemo(() => {
    if (!data?.groups?.length || !data?.groupTeams) return [];
    const sorted = [...data.groups].sort((a, b) => (a.group_order ?? 0) - (b.group_order ?? 0));
    return sorted.map((group) => ({
      group,
      teams: data.groupTeams.filter((gt: GroupTeamDTO) => gt.tournament_group_id === group.id),
    }));
  }, [data?.groups, data?.groupTeams]);

  const load = () => {
    queryClient.invalidateQueries({ queryKey: ["tournament-groups", tournament.id] });
    queryClient.invalidateQueries({ queryKey: ["tournament", tournament.id] });
  };

  const handleCloseReview = async () => {
    try {
      setClosingReview(true);
      const response = await fetch(`/api/tournaments/${tournament.id}/close-schedule-review`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Error al cerrar revisión de horarios");
        return;
      }

      // Cerrar el diálogo
      setShowCloseReviewDialog(false);

      // Invalidar cache y recargar
      load();
      queryClient.invalidateQueries({ queryKey: ["tournament", tournament.id] });
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al cerrar revisión de horarios");
    } finally {
      setClosingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const hasGroups = data && data.groups.length > 0;
  const hasScheduledMatches = data && data.matches.some(m => m.match_date && m.start_time);
  const totalGroupMatches = (data?.matches ?? []).length;

  const handleRegenerateSchedule = () => {
    setShowRegenerateDialog(true);
  };

  const handleConfirmRegenerateSchedule = async () => {
    // Este handler se maneja directamente en TournamentScheduleDialog cuando showLogs es true
    // Solo actualizar los datos sin cerrar el dialog ni recargar la página
    setRegenerating(false);
    setRegenerateError(null);
    // No cerrar el dialog: setShowRegenerateDialog(false);
    // Solo actualizar los datos en silencio (sin invalidar la query del torneo para evitar re-render)
    queryClient.invalidateQueries({ queryKey: ["tournament-groups", tournament.id] });
    // Invalidar la query del torneo solo después de un delay para evitar que se resetee el dialog
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["tournament", tournament.id] });
    }, 1000);
  };

  const handleDeleteGroups = async () => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/tournaments/${tournament.id}/groups`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "Error al eliminar fase de grupos");
        return;
      }
      setShowDeleteDialog(false);
      load();
      // Recargar la página para actualizar el estado en otros tabs
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar fase de grupos");
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmSwap = async (
    team1Id: number,
    group1Id: number,
    team2Id: number,
    group2Id: number
  ) => {
    try {
      setSwapping(true);
      const res = await fetch(`/api/tournaments/${tournament.id}/swap-teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Id,
          group1Id,
          team2Id,
          group2Id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al intercambiar equipos");
        return;
      }
      setShowSwapDialog(false);
      setSwapFirst(null);
      setSwapSecond(null);
      load();
    } catch (e: any) {
      alert(e?.message || "Error al intercambiar equipos");
    } finally {
      setSwapping(false);
    }
  };

  return (
    <Card className="border-none shadow-none p-0">
      <CardHeader className="px-0 pt-0">
        <CardTitle>Revisión de horarios de zona</CardTitle>
        <CardDescription>
          Revisá y editá los horarios de los partidos de la fase de grupos antes de comenzar el torneo.
          Una vez que cierres esta etapa, no podrás modificar los horarios.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 pt-4 space-y-4">
        {hasGroups && (
          <Card className="border bg-muted/30">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Zonas y equipos</CardTitle>
                  <CardDescription className="text-xs">
                    Si hay incompatibilidades para jugar, podés intercambiar un equipo de una zona por otro de otra zona antes de regenerar horarios.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSwapFirst(null);
                    setSwapSecond(null);
                    setShowSwapDialog(true);
                  }}
                >
                  <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                  Intercambiar equipos
                </Button>
              </div>
            </CardHeader>
            <CardContent className="py-2 pt-0">
              <div className="flex flex-wrap gap-4">
                {groupsWithTeams.map(({ group, teams }) => (
                  <div
                    key={group.id}
                    className="rounded-lg border bg-background p-3 min-w-[180px]"
                  >
                    <div className="font-semibold text-sm text-muted-foreground mb-2">
                      {group.name}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {teams.map((gt: GroupTeamDTO) => (
                        <li key={gt.id}>
                          {gt.team ? teamLabelShort(gt.team) : `Equipo #${gt.id}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!hasGroups ? (
          <div className="text-center py-8 text-muted-foreground">
            Primero debes cerrar la inscripción para generar las zonas y partidos.
          </div>
        ) : !hasScheduledMatches ? (
          <div className="text-center py-8 space-y-4">
            <div className="text-muted-foreground">
              No hay horarios asignados. Generá horarios para los partidos de la fase de grupos.
            </div>
            {tournament.status === "schedule_review" && (
              <div className="flex items-center justify-center gap-2">
                <Button onClick={handleRegenerateSchedule}>
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  Generar horarios
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <TrashIcon className="h-4 w-4 mr-2" />
                      Eliminar grupos
                    </>
                  )}
                </Button>
              </div>
            )}
            {tournament.status !== "schedule_review" && (
              <div className="text-sm text-amber-600">
                Esta etapa ya fue cerrada. No se pueden generar horarios desde aquí.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {data.matches.filter(m => m.match_date && m.start_time).length} partidos con horarios asignados
              </div>
              <div className="flex gap-2">
                {tournament.status === "schedule_review" ? (
                  <>
                    {hasGroups && (
                      <Button
                        variant="destructive"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={deleting}
                      >
                        {deleting ? (
                          <>
                            <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                            Eliminando...
                          </>
                        ) : (
                          <>
                            <TrashIcon className="h-4 w-4 mr-2" />
                            Eliminar grupos
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleRegenerateSchedule}
                      disabled={regenerating}
                    >
                      {regenerating ? (
                        <>
                          <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                          Regenerando...
                        </>
                      ) : (
                        <>
                          <RefreshCwIcon className="h-4 w-4 mr-2" />
                          Regenerar horarios
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowScheduleViewer(true)}
                    >
                      Revisar y editar horarios
                    </Button>
                    {hasScheduledMatches && tournament.status === "schedule_review" && (
                      <Button
                        variant="default"
                        onClick={() => setShowCloseReviewDialog(true)}
                        disabled={closingReview}
                      >
                        {closingReview ? (
                          <>
                            <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                            Cerrando...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-4 w-4 mr-2" />
                            Cerrar revisión de horarios
                          </>
                        )}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-amber-600">
                    Esta etapa ya fue cerrada. No se pueden modificar horarios desde aquí.
                  </div>
                )}
              </div>
            </div>

            <GroupScheduleViewer
              open={showScheduleViewer}
              onOpenChange={setShowScheduleViewer}
              matches={data.matches}
              groups={data.groups}
              tournamentId={tournament.id}
              onScheduleUpdated={load}
              tournamentGroupSlots={data.tournamentGroupSlots}
            />

            <TournamentScheduleDialog
              open={showRegenerateDialog}
              onOpenChange={(open) => {
                setShowRegenerateDialog(open);
                if (!open) {
                  setRegenerateError(null);
                }
              }}
              error={regenerateError}
              isLoading={regenerating}
              onConfirm={handleConfirmRegenerateSchedule}
              matchCount={totalGroupMatches}
              tournamentMatchDuration={tournament.match_duration}
              availableSchedules={availableSchedulesGrouped}
              tournamentId={tournament.id}
              showLogs={true}
              streamEndpoint="regenerate-schedule-stream"
            />
          </>
        )}

        {hasGroups && !hasScheduledMatches && (
          <TournamentScheduleDialog
            open={showRegenerateDialog}
            onOpenChange={(open) => {
              setShowRegenerateDialog(open);
              if (!open) {
                setRegenerateError(null);
              }
            }}
            error={regenerateError}
            isLoading={regenerating}
            onConfirm={handleConfirmRegenerateSchedule}
            matchCount={totalGroupMatches}
            tournamentMatchDuration={tournament.match_duration}
            availableSchedules={availableSchedulesGrouped}
            tournamentId={tournament.id}
            showLogs={true}
            streamEndpoint="regenerate-schedule-stream"
          />
        )}

        {/* Diálogo de confirmación para eliminar fase de grupos */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar eliminación de fase de grupos</DialogTitle>
              <DialogDescription>
                <div>
                  ¿Estás seguro de que deseas eliminar toda la fase de grupos? Esta acción eliminará:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Todos los grupos</li>
                    <li>Todos los partidos de grupos</li>
                    <li>Todos los resultados cargados</li>
                    <li>Todas las tablas de posiciones</li>
                    <li>Todas las asignaciones de equipos a grupos</li>
                  </ul>
                  <div className="mt-2 font-semibold text-amber-600">
                    Esta acción no se puede deshacer. Podrás volver a generar los grupos desde la fase de inscripción.
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDeleteGroups} disabled={deleting}>
                {deleting ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                    Eliminando...
                  </>
                ) : (
                  "Confirmar y eliminar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo para intercambiar equipos entre zonas */}
        <Dialog
          open={showSwapDialog}
          onOpenChange={(open) => {
            setShowSwapDialog(open);
            if (!open) {
              setSwapFirst(null);
              setSwapSecond(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Intercambiar equipos entre zonas</DialogTitle>
              <DialogDescription>
                Elegí dos equipos de zonas distintas. Se intercambiarán de zona (y todos sus partidos de zona se actualizarán). Después podés regenerar los horarios.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {swapFirst && (
                <p className="text-sm text-muted-foreground">
                  Primer equipo: <strong>{swapFirst.label}</strong> ({swapFirst.groupName})
                </p>
              )}
              {swapSecond && swapFirst && (
                <p className="text-sm text-muted-foreground">
                  Segundo equipo: <strong>{swapSecond.label}</strong> ({swapSecond.groupName})
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {!swapFirst
                  ? "Hacé clic en un equipo para elegirlo como primero."
                  : !swapSecond
                    ? "Hacé clic en un equipo de otra zona para elegirlo como segundo."
                    : "Podés hacer clic en otro equipo para cambiar la selección."}
              </p>
              <div className="flex flex-wrap gap-3 max-h-[280px] overflow-y-auto">
                {groupsWithTeams.map(({ group, teams }) => (
                  <div
                    key={group.id}
                    className="rounded-lg border bg-muted/30 p-2 min-w-[160px]"
                  >
                    <div className="font-semibold text-xs text-muted-foreground mb-2">
                      {group.name}
                    </div>
                    <ul className="space-y-1">
                      {teams.map((gt: GroupTeamDTO) => {
                        if (!gt.team) return null;
                        const entry: SwapEntry = {
                          teamId: gt.team.id,
                          groupId: group.id,
                          groupName: group.name,
                          label: teamLabelShort(gt.team),
                        };
                        const isFirst = swapFirst?.teamId === entry.teamId && swapFirst?.groupId === entry.groupId;
                        const isSecond = swapSecond?.teamId === entry.teamId && swapSecond?.groupId === entry.groupId;
                        const selected = isFirst || isSecond;
                        const handleClick = () => {
                          if (isFirst) {
                            setSwapFirst(null);
                            return;
                          }
                          if (isSecond) {
                            setSwapSecond(null);
                            return;
                          }
                          if (!swapFirst) {
                            setSwapFirst(entry);
                            return;
                          }
                          if (swapFirst.groupId === entry.groupId) {
                            setSwapFirst(entry);
                            setSwapSecond(null);
                            return;
                          }
                          setSwapSecond(entry);
                        };
                        return (
                          <li key={gt.id}>
                            <Button
                              type="button"
                              variant={selected ? "default" : "ghost"}
                              size="sm"
                              className="w-full justify-start text-xs font-normal h-8"
                              onClick={handleClick}
                            >
                              {teamLabelShort(gt.team)}
                              {(isFirst || isSecond) && (
                                <span className="ml-1 text-[10px] opacity-80">
                                  {isFirst ? "(1)" : "(2)"}
                                </span>
                              )}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSwapDialog(false);
                  setSwapFirst(null);
                  setSwapSecond(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  !swapFirst ||
                  !swapSecond ||
                  swapFirst.groupId === swapSecond.groupId ||
                  swapping
                }
                onClick={() =>
                  swapFirst &&
                  swapSecond &&
                  handleConfirmSwap(
                    swapFirst.teamId,
                    swapFirst.groupId,
                    swapSecond.teamId,
                    swapSecond.groupId
                  )
                }
              >
                {swapping ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                    Intercambiando...
                  </>
                ) : (
                  <>
                    <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                    Intercambiar equipos
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo de confirmación para cerrar revisión de horarios */}
        <Dialog open={showCloseReviewDialog} onOpenChange={setShowCloseReviewDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar cierre de revisión de horarios</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas cerrar la revisión de horarios? Esta acción:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Bloqueará la modificación de horarios de la fase de grupos</li>
                  <li>Pasará el torneo a la fase de grupos (in_progress)</li>
                </ul>
                <p className="mt-2 font-semibold text-amber-600">
                  Una vez cerrada, no podrás modificar los horarios de los partidos. Esta acción no se puede deshacer.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCloseReviewDialog(false)}
                disabled={closingReview}
              >
                Cancelar
              </Button>
              <Button variant="default" onClick={handleCloseReview} disabled={closingReview}>
                {closingReview ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                    Cerrando...
                  </>
                ) : (
                  "Confirmar y cerrar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

