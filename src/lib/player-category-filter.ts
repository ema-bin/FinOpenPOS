import type { PlayerDTO } from "@/models/dto/player";

/** Incluye jugadores cuya categoría libre o damas coincide con el id elegido. */
export function playerMatchesCategoryFilter(
  player: PlayerDTO,
  categoryId: number | null
): boolean {
  if (categoryId === null) return true;
  return (
    player.category_id === categoryId ||
    player.female_category_id === categoryId
  );
}

/** Sin categoría libre ni damas asignada. */
export function playerHasNoCategory(player: PlayerDTO): boolean {
  return player.category_id == null && player.female_category_id == null;
}

export type PlayersTableCategoryFilter = "all" | "none" | number;

/** Filtro de la tabla de clientes: todas, sin ninguna categoría, o id concreto (libre o damas). */
export function playerMatchesPlayersTableCategoryFilter(
  player: PlayerDTO,
  filter: PlayersTableCategoryFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "none") return playerHasNoCategory(player);
  return playerMatchesCategoryFilter(player, filter);
}
