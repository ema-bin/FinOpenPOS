/** Paleta de badges de zona — alto contraste sobre filas naranjas (#e67e1d). */
export const SHARE_ZONE_BADGE_COLOR_COUNT = 8;

export function buildGroupColorIndexMap(
  groups: Array<{ id: number; name?: string | null; group_order?: number }>,
): Map<number, number> {
  const sorted = [...groups].sort((a, b) => {
    if (a.group_order !== undefined && b.group_order !== undefined) {
      return a.group_order - b.group_order;
    }
    return (a.name ?? "").trim().localeCompare((b.name ?? "").trim(), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  const map = new Map<number, number>();
  sorted.forEach((g, index) => map.set(g.id, index % SHARE_ZONE_BADGE_COLOR_COUNT));
  return map;
}

/** Fallback: "Zona E" / "ZONA C" → índice por letra. */
export function getZoneColorIndexFromName(groupName: string): number | null {
  const match = groupName.match(/(?:zona|zone)\s*([a-z])/i);
  if (!match) return null;
  const code = match[1].toUpperCase().charCodeAt(0) - 65;
  if (code < 0 || code > 25) return null;
  return code % SHARE_ZONE_BADGE_COLOR_COUNT;
}

export function resolveZoneColorIndex(
  groupId: number | null | undefined,
  groupName: string,
  groupColorIndexMap: Map<number, number>,
): number {
  if (groupId != null) {
    const fromMap = groupColorIndexMap.get(groupId);
    if (fromMap !== undefined) return fromMap;
  }
  return getZoneColorIndexFromName(groupName) ?? 0;
}

export function getShareZoneBadgeClassName(colorIndex: number): string {
  const slot = ((colorIndex % SHARE_ZONE_BADGE_COLOR_COUNT) + SHARE_ZONE_BADGE_COLOR_COUNT) %
    SHARE_ZONE_BADGE_COLOR_COUNT;
  return `share-group-schedule-zone--${slot}`;
}
