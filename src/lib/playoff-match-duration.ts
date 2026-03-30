/**
 * Fase de grupos: match_duration.
 * Todos los partidos de playoffs (16avos, octavos, cuartos, etc.) usan match_duration_quarters_onwards.
 */

/** Duración en minutos de un partido de playoffs (todas las rondas). */
export function playoffMatchDurationMinutes(playoffMinutesFromDb: number): number {
  return Math.max(15, playoffMinutesFromDb);
}

/** Intervalo entre slots al generar la grilla de playoffs (misma duración para todas las rondas). */
export function slotIntervalMinutesForPlayoffScheduling(playoffMinutesFromDb: number): number {
  return Math.max(15, playoffMinutesFromDb);
}
