import type { SupabaseClient } from "@supabase/supabase-js";

/** Formatos conocidos. Cada uno distinto de `standard` tiene su propia puerta. */
export const TOURNAMENT_FORMATS = ["standard", "master"] as const;

export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export function isTournamentFormat(value: unknown): value is TournamentFormat {
  return value === "standard" || value === "master";
}

export function isMastersFormat(value: unknown): boolean {
  return value === "master";
}

/**
 * Lee el formato sin cambiar el resto del torneo.
 * Si la columna todavía no existe, se toma el formato de siempre.
 */
export async function readTournamentFormat(
  supabase: SupabaseClient,
  tournamentId: number
): Promise<TournamentFormat> {
  try {
    const { data, error } = await supabase
      .from("tournaments")
      .select("format")
      .eq("id", tournamentId)
      .maybeSingle();
    if (error || !data) return "standard";
    return isMastersFormat((data as { format?: string | null }).format)
      ? "master"
      : "standard";
  } catch {
    return "standard";
  }
}

/** Ids de torneos Master dentro de una lista. Si la columna no existe, ninguno. */
export async function loadMastersTournamentIds(
  supabase: SupabaseClient,
  tournamentIds: number[]
): Promise<Set<number>> {
  if (tournamentIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, format")
      .in("id", tournamentIds);
    if (error || !Array.isArray(data)) return new Set();
    const ids = new Set<number>();
    for (const row of data as Array<{ id?: number; format?: string | null }>) {
      if (row.id != null && isMastersFormat(row.format)) ids.add(row.id);
    }
    return ids;
  } catch {
    return new Set();
  }
}
