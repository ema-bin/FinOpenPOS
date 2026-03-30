/**
 * Playoffs: zona + 16avos + octavos comparten match_duration;
 * cuartos en adelante usan match_duration_quarters_onwards.
 */

export function playoffMatchDurationMinutes(
  round: string,
  zoneAndEarlyPlayoffsMin: number,
  quartersOnwardsMin: number
): number {
  const early = Math.max(15, zoneAndEarlyPlayoffsMin);
  const late = Math.max(15, quartersOnwardsMin);
  if (round === "cuartos" || round === "semifinal" || round === "final") {
    return late;
  }
  return early;
}

/** Intervalo entre slots al generar la grilla de playoffs (evita solapes en la misma cancha). */
export function slotIntervalMinutesForPlayoffScheduling(
  zoneAndEarlyPlayoffsMin: number,
  quartersOnwardsMin: number
): number {
  return Math.max(
    15,
    Math.max(15, zoneAndEarlyPlayoffsMin),
    Math.max(15, quartersOnwardsMin)
  );
}
