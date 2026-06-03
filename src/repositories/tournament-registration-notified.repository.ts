import { BaseRepository } from "./base-repository";

export type TournamentRegistrationNotifiedRow = {
  player_id: number;
  notified_at: string;
};

export class TournamentRegistrationNotifiedRepository extends BaseRepository {
  async findByTournamentId(
    tournamentId: number
  ): Promise<TournamentRegistrationNotifiedRow[]> {
    const { data, error } = await this.supabase
      .from("tournament_registration_notified")
      .select("player_id, notified_at")
      .eq("tournament_id", tournamentId);

    if (error) {
      throw new Error(`Failed to fetch notified players: ${error.message}`);
    }
    return (data ?? []) as TournamentRegistrationNotifiedRow[];
  }

  async markNotified(tournamentId: number, playerId: number): Promise<void> {
    const { error } = await this.supabase
      .from("tournament_registration_notified")
      .upsert(
        {
          tournament_id: tournamentId,
          player_id: playerId,
          user_uid: this.userId,
          notified_at: new Date().toISOString(),
        },
        { onConflict: "tournament_id,player_id" }
      );

    if (error) {
      throw new Error(`Failed to mark player notified: ${error.message}`);
    }
  }

  async unmarkNotified(tournamentId: number, playerId: number): Promise<void> {
    const { error } = await this.supabase
      .from("tournament_registration_notified")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId);

    if (error) {
      throw new Error(`Failed to unmark player notified: ${error.message}`);
    }
  }
}
