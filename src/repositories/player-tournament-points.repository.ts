import { BaseRepository } from "./base-repository";
import type {
  PlayerTournamentPoint,
  CreatePlayerTournamentPointInput,
} from "@/models/db/player-tournament-points";

export class PlayerTournamentPointsRepository extends BaseRepository {
  /**
   * Insert points for all players of a tournament (idempotent: delete existing for tournament then insert).
   */
  async replaceForTournament(
    tournamentId: number,
    rows: CreatePlayerTournamentPointInput[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const { error: deleteError } = await this.supabase
      .from("player_tournament_points")
      .delete()
      .eq("tournament_id", tournamentId);
    if (deleteError) {
      throw new Error(`Failed to clear existing points: ${deleteError.message}`);
    }
    const { error: insertError } = await this.supabase
      .from("player_tournament_points")
      .insert(rows);
    if (insertError) {
      throw new Error(`Failed to insert ranking points: ${insertError.message}`);
    }
  }

  /**
   * Get ranking by category and year (for display). Returns player_id, total points, and optional breakdown.
   */
  async getRankingByCategoryAndYear(
    categoryId: number,
    year: number
  ): Promise<
    Array<{
      player_id: number;
      total_points: number;
      tournaments_played: number;
    }>
  > {
    const { data, error } = await this.supabase
      .from("player_tournament_points")
      .select("player_id, points")
      .eq("category_id", categoryId)
      .eq("year", year);
    if (error) {
      throw new Error(`Failed to fetch ranking: ${error.message}`);
    }
    const byPlayer = new Map<number, { total: number; count: number }>();
    for (const row of data ?? []) {
      const current = byPlayer.get(row.player_id) ?? { total: 0, count: 0 };
      current.total += row.points;
      current.count += 1;
      byPlayer.set(row.player_id, current);
    }
    return Array.from(byPlayer.entries())
      .map(([player_id, { total, count }]) => ({
        player_id,
        total_points: total,
        tournaments_played: count,
      }))
      .sort((a, b) => b.total_points - a.total_points);
  }

  /**
   * Get all point rows for a category and year (for breakdown by tournament).
   */
  async findByCategoryAndYear(
    categoryId: number,
    year: number
  ): Promise<PlayerTournamentPoint[]> {
    const { data, error } = await this.supabase
      .from("player_tournament_points")
      .select("*")
      .eq("category_id", categoryId)
      .eq("year", year)
      .order("tournament_id", { ascending: true })
      .order("points", { ascending: false });
    if (error) throw new Error(`Failed to fetch points: ${error.message}`);
    return (data ?? []) as PlayerTournamentPoint[];
  }

  /**
   * Point rows for one player in a year (optionally filtered by category ids), with tournament info.
   */
  async findByPlayerYearAndCategories(
    playerId: number,
    year: number,
    categoryIds: number[]
  ): Promise<
    Array<{
      tournament_id: number;
      category_id: number;
      points: number;
      round_reached: string;
      tournament_name: string;
      is_grand_prix: boolean;
    }>
  > {
    if (categoryIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("player_tournament_points")
      .select(
        "tournament_id, category_id, points, round_reached, tournament:tournaments!tournament_id(name, is_grand_prix)"
      )
      .eq("player_id", playerId)
      .eq("year", year)
      .in("category_id", categoryIds)
      .order("points", { ascending: false });
    if (error) {
      throw new Error(`Failed to fetch player breakdown: ${error.message}`);
    }
    return (data ?? []).map((row) => {
      const t = row.tournament as
        | { name: string; is_grand_prix: boolean }
        | { name: string; is_grand_prix: boolean }[]
        | null;
      const tournament = Array.isArray(t) ? t[0] : t;
      return {
        tournament_id: row.tournament_id as number,
        category_id: row.category_id as number,
        points: row.points as number,
        round_reached: row.round_reached as string,
        tournament_name: tournament?.name ?? "Torneo",
        is_grand_prix: Boolean(tournament?.is_grand_prix),
      };
    });
  }

  /**
   * Check if points were already saved for this tournament (avoid duplicate run).
   */
  async hasPointsForTournament(tournamentId: number): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("player_tournament_points")
      .select("id")
      .eq("tournament_id", tournamentId)
      .limit(1);
    if (error) throw new Error(`Failed to check points: ${error.message}`);
    return (data ?? []).length > 0;
  }
}
