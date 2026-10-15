export const MASTER_QUALIFIER_COUNT = 16;
/** En el flyer van pocos suplentes, en una sola columna debajo de los clasificados. */
export const MASTER_FLYER_SUBSTITUTE_COUNT = 6;

export type MasterRankingCandidate = {
  tournaments_played: number;
};

/** Primeros 16 con más de `minTournaments` torneos, y el resto que también llega como suplentes. */
export function splitMasterRanking<T extends MasterRankingCandidate>(
  rows: readonly T[],
  minTournaments: number,
  spots = MASTER_QUALIFIER_COUNT
): { qualifiers: T[]; substitutes: T[] } {
  const eligible = rows.filter((row) => row.tournaments_played > minTournaments);
  const limit = Math.max(0, spots);
  return {
    qualifiers: eligible.slice(0, limit),
    substitutes: eligible.slice(limit),
  };
}
