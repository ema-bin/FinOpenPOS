import type { Tournament } from "@/models/db/tournament";
import type { CategoriesRepository } from "@/repositories/categories.repository";

type PlayerWithCategory = { id: number; first_name: string; last_name: string; category_id: number | null };

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
