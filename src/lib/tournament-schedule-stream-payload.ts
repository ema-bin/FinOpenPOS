/**
 * Payload compartido entre streams de cierre / regeneración de horarios
 * cuando el cliente elige combinaciones (slot del torneo × cancha).
 */

export type TournamentPhysicalSlotSelection = {
  tournamentGroupSlotId: number;
  courtId: number;
};

export function parseTournamentPhysicalSlotSelections(
  body: Record<string, unknown>
): TournamentPhysicalSlotSelection[] {
  const raw = body.selectedPhysicalSlots;
  if (!Array.isArray(raw)) return [];
  const out: TournamentPhysicalSlotSelection[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const slotId = Number(r.tournamentGroupSlotId ?? r.slotId);
    const courtId = Number(r.courtId);
    if (!Number.isFinite(slotId) || slotId <= 0) continue;
    if (!Number.isFinite(courtId) || courtId <= 0) continue;
    out.push({ tournamentGroupSlotId: slotId, courtId });
  }
  return out;
}

/** Por cada slot del torneo, canchas bloqueadas = unión menos las permitidas explícitamente. */
export function buildBlockedCourtsFromPhysicalSelections(
  unionCourtIds: number[],
  tournamentSlotIds: number[],
  pairs: TournamentPhysicalSlotSelection[]
): Map<number, Set<number>> {
  const allowedBySlot = new Map<number, Set<number>>();
  for (const p of pairs) {
    if (!allowedBySlot.has(p.tournamentGroupSlotId)) {
      allowedBySlot.set(p.tournamentGroupSlotId, new Set());
    }
    allowedBySlot.get(p.tournamentGroupSlotId)!.add(p.courtId);
  }

  const blocked = new Map<number, Set<number>>();
  const courtList = unionCourtIds.slice();
  for (let si = 0; si < tournamentSlotIds.length; si++) {
    const slotId = tournamentSlotIds[si];
    const allowed = allowedBySlot.get(slotId);
    for (let ci = 0; ci < courtList.length; ci++) {
      const courtId = courtList[ci];
      if (allowed?.has(courtId)) continue;
      if (!blocked.has(slotId)) blocked.set(slotId, new Set());
      blocked.get(slotId)!.add(courtId);
    }
  }
  return blocked;
}

export function mergeBlockedCourtsByTournamentSlot(
  a: Map<number, Set<number>> | undefined,
  b: Map<number, Set<number>> | undefined
): Map<number, Set<number>> | undefined {
  if (!a?.size && !b?.size) return undefined;
  const out = new Map<number, Set<number>>();
  const add = (m: Map<number, Set<number>>) => {
    m.forEach((set, id) => {
      if (!out.has(id)) out.set(id, new Set());
      set.forEach((c) => {
        out.get(id)!.add(c);
      });
    });
  };
  if (a?.size) add(a);
  if (b?.size) add(b);
  return out;
}
