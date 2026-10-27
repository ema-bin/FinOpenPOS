export const MASTER_QUALIFIER_COUNT = 16;
/** En el flyer van pocos suplentes, en una sola columna debajo de los clasificados. */
export const MASTER_FLYER_SUBSTITUTE_COUNT = 6;

export type MasterRankingCandidate = {
  tournaments_played: number;
};

/**
 * Primeros `spots` con más de `minTournaments` torneos.
 * El resto que también llega queda como suplente.
 * Si no alcanzan `substituteSpots`, se completan con los siguientes del ranking.
 */
export function splitMasterRanking<T extends MasterRankingCandidate>(
  rows: readonly T[],
  minTournaments: number,
  spots = MASTER_QUALIFIER_COUNT,
  substituteSpots = MASTER_FLYER_SUBSTITUTE_COUNT
): { qualifiers: T[]; substitutes: T[] } {
  const eligible = rows.filter((row) => row.tournaments_played > minTournaments);
  const limit = Math.max(0, spots);
  const qualifiers = eligible.slice(0, limit);
  const fromMinimum = eligible.slice(limit);
  const needed = Math.max(0, substituteSpots);
  if (fromMinimum.length >= needed) {
    return { qualifiers, substitutes: fromMinimum };
  }

  const chosen = new Set<T>([...qualifiers, ...fromMinimum]);
  const extras: T[] = [];
  for (const row of rows) {
    if (chosen.has(row)) continue;
    extras.push(row);
    if (fromMinimum.length + extras.length >= needed) break;
  }

  return { qualifiers, substitutes: [...fromMinimum, ...extras] };
}
