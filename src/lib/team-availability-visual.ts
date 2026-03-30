/** Nivel visual según cuántos slots del torneo puede usar la pareja (restricciones = no puede). */
export type TeamAvailabilityLevel = "green" | "yellow" | "red" | "none";

export function getTeamAvailabilityLevel(
  totalSlots: number,
  restrictedSlotIds: number[] | undefined,
  tournamentSlotIds: Set<number>
): { level: TeamAvailabilityLevel; available: number; total: number } {
  if (totalSlots <= 0) {
    return { level: "none", available: 0, total: 0 };
  }
  const restrictedCount = (restrictedSlotIds ?? []).filter((id) =>
    tournamentSlotIds.has(id)
  ).length;
  const available = Math.max(0, Math.min(totalSlots, totalSlots - restrictedCount));

  if (available >= totalSlots) {
    return { level: "green", available, total: totalSlots };
  }
  // Estrictamente menos de la mitad de los horarios disponibles → rojo
  if (available * 2 < totalSlots) {
    return { level: "red", available, total: totalSlots };
  }
  // Más de la mitad pero no todos → amarillo
  if (available < totalSlots) {
    return { level: "yellow", available, total: totalSlots };
  }
  return { level: "green", available, total: totalSlots };
}

export function availabilityRowClassName(level: TeamAvailabilityLevel): string {
  switch (level) {
    case "green":
      return "border-emerald-400/90 bg-emerald-50/90 dark:bg-emerald-950/35 dark:border-emerald-800";
    case "yellow":
      return "border-amber-400/90 bg-amber-50/90 dark:bg-amber-950/35 dark:border-amber-800";
    case "red":
      return "border-red-400/90 bg-red-50/90 dark:bg-red-950/35 dark:border-red-900";
    default:
      return "";
  }
}

export function availabilityBadgeClassName(level: TeamAvailabilityLevel): string {
  switch (level) {
    case "green":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100";
    case "yellow":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100";
    case "red":
      return "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100";
    default:
      return "";
  }
}
