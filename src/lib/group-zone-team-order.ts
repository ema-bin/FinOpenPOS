/** Orden dentro de una zona: cabeza de zona = menor display_order (orden de inscripción). */

export function buildTeamDisplayOrderMap(
  teams: Array<{ id: number; display_order?: number | null }>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const team of teams) {
    map.set(team.id, team.display_order ?? Number.MAX_SAFE_INTEGER);
  }
  return map;
}

export function compareTeamsByDisplayOrder(
  a: { id?: number; display_order?: number | null } | null | undefined,
  b: { id?: number; display_order?: number | null } | null | undefined,
): number {
  const orderA = a?.display_order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b?.display_order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return (a?.id ?? 0) - (b?.id ?? 0);
}

/** Reordena equipos de una zona: cabeza primero, resto por display_order. */
export function sortTeamIdsWithZoneHeadFirst(
  teamIds: number[],
  displayOrderByTeamId: Map<number, number>,
): number[] {
  return [...teamIds].sort((a, b) => {
    const orderA = displayOrderByTeamId.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = displayOrderByTeamId.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a - b;
  });
}

type ShareMatchTeam = {
  id?: number;
  display_order?: number | null;
  display_name?: string | null;
  player1?: { last_name?: string | null } | null;
  player2?: { last_name?: string | null } | null;
} | null | undefined;

/** Para fliers: muestra el cabeza de zona primero en "Equipo A vs Equipo B". */
export function orderShareMatchTeamLabels(
  team1: ShareMatchTeam,
  team2: ShareMatchTeam,
  matchOrder: number | null | undefined,
  label: (team: ShareMatchTeam, isTeam1: boolean) => string,
): [string, string] {
  if (!team1?.id || !team2?.id) {
    return [label(team1, true), label(team2, false)];
  }

  if (compareTeamsByDisplayOrder(team1, team2) <= 0) {
    return [label(team1, true), label(team2, false)];
  }

  return [label(team2, true), label(team1, false)];
}
