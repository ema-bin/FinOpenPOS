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
