import type { TournamentStatus } from "@/models/db/tournament";

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Inscripción",
  schedule_review: "Revisión de horarios",
  in_progress: "En progreso",
  playoffs_ready: "Listo para playoffs",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

export function tournamentStatusLabel(status: TournamentStatus): string {
  return TOURNAMENT_STATUS_LABELS[status] ?? status;
}
