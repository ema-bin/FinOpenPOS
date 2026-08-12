type CategoryType = "libre" | "damas";

export type CategorySkillMeta = {
  name: string;
  type: CategoryType;
  display_order: number;
};

/** Mayor valor = mejor categoría (3ra > 7ma > 8va). */
export function getCategorySkillOrder(meta: CategorySkillMeta): number {
  if (meta.type === "damas") {
    const fromName = damasSkillOrderFromName(meta.name);
    if (fromName >= 0) return fromName;
  }
  return meta.display_order;
}

/** Peor o igual que la categoría del ranking → visible (8va sí en 7ma; 6ta no en 7ma). */
export function isPlayerVisibleInRankingCategory(
  playerSkillOrder: number,
  rankingSkillOrder: number,
): boolean {
  return playerSkillOrder <= rankingSkillOrder;
}

/** Categoría inmediatamente inferior (un escalón peor). */
export function findImmediateLowerCategoryId(
  categories: Array<{ id: number; name: string; type: CategoryType; display_order: number }>,
  rankingCategoryId: number,
): number | null {
  const rankingCat = categories.find((c) => c.id === rankingCategoryId);
  if (!rankingCat) return null;

  const rankingSkill = getCategorySkillOrder(rankingCat);
  let best: { id: number; skill: number } | null = null;

  for (const cat of categories) {
    if (cat.type !== rankingCat.type) continue;
    const skill = getCategorySkillOrder(cat);
    if (skill >= rankingSkill) continue;
    if (!best || skill > best.skill) {
      best = { id: cat.id, skill };
    }
  }

  return best?.id ?? null;
}

function damasSkillOrderFromName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("8va")) return 0;
  if (n.includes("7ma")) return 1;
  if (n.includes("6ta")) return 2;
  if (n.includes("5ta")) return 3;
  if (n.includes("4ta")) return 4;
  if (n.includes("suma 13")) return 5;
  return -1;
}
