import type { Tournament } from "@/models/db/tournament";
import type { CategoriesRepository } from "@/repositories/categories.repository";
import { getCategorySkillOrder, isPlayerVisibleInRankingCategory } from "@/lib/category-skill-order";

type CategoryType = "libre" | "damas";

type PlayerWithCategory = {
  id: number;
  first_name: string;
  last_name: string;
  category_id: number | null;
  female_category_id?: number | null;
};
type PlayerForSuma13 = {
  first_name: string;
  last_name: string;
  gender: string | null;
  female_category_id: number | null;
};

type CategoryMeta = { display_order: number; type: CategoryType; name: string };

/**
 * Torneos de categoría específica: puede inscribirse quien tenga la misma categoría
 * o una peor (ej. 8va damas sí en torneo 7ma damas; 5ta damas no).
 * display_order mayor = mejor categoría → permitido cuando playerOrder <= tournamentOrder.
 */
export function resolvePlayerCategoryIdForTournament(
  player: PlayerWithCategory,
  tournamentType: CategoryType,
  categoryMetaById: Map<number, CategoryMeta>,
): number | null {
  if (tournamentType === "damas") {
    if (player.female_category_id != null) return player.female_category_id;
    if (player.category_id != null) {
      const meta = categoryMetaById.get(player.category_id);
      if (meta?.type === "damas") return player.category_id;
    }
    return null;
  }

  if (player.category_id != null) {
    const meta = categoryMetaById.get(player.category_id);
    if (meta?.type === "libre") return player.category_id;
  }
  return null;
}

export function resolvePlayerCategoryIdForRanking(
  player: Pick<PlayerWithCategory, "category_id" | "female_category_id">,
  rankingCategoryType: CategoryType,
  categoryMetaById: Map<number, CategoryMeta>,
): number | null {
  return resolvePlayerCategoryIdForTournament(
    player as PlayerWithCategory,
    rankingCategoryType,
    categoryMetaById,
  );
}

export function isPlayerCategoryEligibleForTournament(
  playerOrder: number,
  tournamentOrder: number,
): boolean {
  return isPlayerVisibleInRankingCategory(playerOrder, tournamentOrder);
}

export function isPlayerEligibleForRankingCategory(
  playerCategoryMeta: CategoryMeta | undefined,
  rankingCategoryMeta: CategoryMeta,
): boolean {
  if (!playerCategoryMeta || playerCategoryMeta.type !== rankingCategoryMeta.type) {
    return false;
  }
  const playerSkill = getCategorySkillOrder(playerCategoryMeta);
  const rankingSkill = getCategorySkillOrder(rankingCategoryMeta);
  return isPlayerVisibleInRankingCategory(playerSkill, rankingSkill);
}

export function isPlayerCategoryEligibleForTournamentByMeta(
  playerMeta: CategoryMeta | undefined,
  tournamentMeta: CategoryMeta,
): boolean {
  if (!playerMeta || playerMeta.type !== tournamentMeta.type) {
    return false;
  }
  return isPlayerCategoryEligibleForTournament(
    getCategorySkillOrder(playerMeta),
    getCategorySkillOrder(tournamentMeta),
  );
}

/**
 * For category-specific tournaments: players must have same or worse category than the tournament.
 */
export async function validateCategoryEligibility(
  tournament: Tournament,
  player1: PlayerWithCategory | null,
  player2: PlayerWithCategory | null,
  categoriesRepo: CategoriesRepository,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tournament.is_category_specific || tournament.category_id == null) {
    return { ok: true };
  }

  const tournamentMetaMap = await categoriesRepo.getMetaByIds([tournament.category_id]);
  const tournamentMeta = tournamentMetaMap.get(tournament.category_id);
  if (!tournamentMeta) {
    return { ok: true };
  }

  const playerCategoryIds: number[] = [];
  for (const player of [player1, player2]) {
    if (!player) continue;
    if (player.category_id != null) playerCategoryIds.push(player.category_id);
    if (player.female_category_id != null) playerCategoryIds.push(player.female_category_id);
  }

  const categoryMetaById = playerCategoryIds.length
    ? await categoriesRepo.getMetaByIds(playerCategoryIds)
    : new Map<number, CategoryMeta>();

  for (const player of [player1, player2]) {
    if (!player) continue;

    const playerCatId = resolvePlayerCategoryIdForTournament(
      player,
      tournamentMeta.type,
      categoryMetaById,
    );
    if (playerCatId == null) continue;

    const playerMeta = categoryMetaById.get(playerCatId);
    if (!playerMeta || playerMeta.type !== tournamentMeta.type) {
      continue;
    }

    if (!isPlayerCategoryEligibleForTournamentByMeta(playerMeta, tournamentMeta)) {
      return {
        ok: false,
        error: `${player.first_name} ${player.last_name} no se puede inscribir: su categoría es superior a la del torneo (solo se permiten misma categoría o inferior).`,
      };
    }
  }

  return { ok: true };
}

const FEMALE_GENDER_VALUES = new Set(["female", "f", "femenino", "mujer"]);

/**
 * For "suma 13 damas" tournaments: both players must be women, both must have
 * a damas category (female_category_id), and the sum of their category values
 * (4ta=4, 5ta=5, 6ta=6, 7ma=7) must be >= 13.
 */
export async function validateSuma13DamasEligibility(
  tournament: Tournament,
  player1: PlayerForSuma13 | null,
  player2: PlayerForSuma13 | null,
  categoriesRepo: CategoriesRepository,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tournament.is_suma_13_damas) {
    return { ok: true };
  }

  for (const player of [player1, player2]) {
    if (!player) continue;
    const isFemale =
      player.gender != null && FEMALE_GENDER_VALUES.has(player.gender.toLowerCase().trim());
    if (!isFemale) {
      return {
        ok: false,
        error: `${player.first_name} ${player.last_name} no puede inscribirse: el torneo Suma 13 damas es solo para mujeres.`,
      };
    }
    if (player.female_category_id == null) {
      return {
        ok: false,
        error: `${player.first_name} ${player.last_name} debe tener categoría de damas asignada para inscribirse en Suma 13 damas.`,
      };
    }
  }

  const catIds = [player1!.female_category_id!, player2!.female_category_id!];
  const sumValues = await categoriesRepo.getSumValuesByIds(catIds);
  const v1 = sumValues.get(player1!.female_category_id!);
  const v2 = sumValues.get(player2!.female_category_id!);
  if (v1 == null || v2 == null) {
    return {
      ok: false,
      error: "No se pudo verificar la categoría de damas de alguna jugadora.",
    };
  }
  const sum = v1 + v2;
  if (sum < 13) {
    return {
      ok: false,
      error: `La suma de categorías de damas debe ser al menos 13 (actual: ${v1} + ${v2} = ${sum}). Por ejemplo: 6ta damas con 7ma damas sí puede; 6ta con 6ta no.`,
    };
  }

  return { ok: true };
}
