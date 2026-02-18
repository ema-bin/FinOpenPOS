import type { Tournament } from "@/models/db/tournament";
import type { CategoriesRepository } from "@/repositories/categories.repository";

type PlayerWithCategory = { id: number; first_name: string; last_name: string; category_id: number | null };
type PlayerForSuma13 = { first_name: string; last_name: string; gender: string | null; female_category_id: number | null };

/**
 * For puntuable + category-specific tournaments: a player may only register if
 * their category is the same or "worse" than the tournament's (e.g. 6ta, 7ma, 8va can play in a 6ta tournament; 5ta cannot).
 * We use display_order: lower order = worse category, so allowed when playerOrder <= tournamentOrder.
 */
export async function validateCategoryEligibility(
  tournament: Tournament,
  player1: PlayerWithCategory | null,
  player2: PlayerWithCategory | null,
  categoriesRepo: CategoriesRepository
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tournament.is_puntuable || !tournament.is_category_specific || tournament.category_id == null) {
    return { ok: true };
  }

  const categoryIds: number[] = [tournament.category_id];
  if (player1?.category_id != null) categoryIds.push(player1.category_id);
  if (player2?.category_id != null) categoryIds.push(player2.category_id);

  const orderByCategoryId = await categoriesRepo.getDisplayOrdersByIds(categoryIds);
  const tournamentOrder = orderByCategoryId.get(tournament.category_id);
  if (tournamentOrder === undefined) {
    return { ok: true }; // tournament category missing in DB, skip validation
  }

  for (const player of [player1, player2]) {
    if (!player) continue;
    if (player.category_id == null) continue; // Sin categoría asignada: se permite inscribir
    const playerOrder = orderByCategoryId.get(player.category_id);
    if (playerOrder === undefined) {
      return {
        ok: false,
        error: `No se pudo verificar la categoría de ${player.first_name} ${player.last_name}.`,
      };
    }
    if (playerOrder > tournamentOrder) {
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
  categoriesRepo: CategoriesRepository
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tournament.is_suma_13_damas) {
    return { ok: true };
  }

  for (const player of [player1, player2]) {
    if (!player) continue;
    const isFemale = player.gender != null && FEMALE_GENDER_VALUES.has(player.gender.toLowerCase().trim());
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
