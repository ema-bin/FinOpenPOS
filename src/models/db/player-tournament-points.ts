// Puntos de ranking por jugador por torneo (torneos puntuables)

export type RoundReached =
  | "groups"
  | "16avos"
  | "octavos"
  | "cuartos"
  | "semifinal"
  | "final"
  | "champion";

export interface PlayerTournamentPoint {
  id: number;
  tournament_id: number;
  player_id: number;
  category_id: number;
  points: number;
  round_reached: RoundReached;
  year: number;
  created_at: string;
}

export interface CreatePlayerTournamentPointInput {
  tournament_id: number;
  player_id: number;
  category_id: number;
  points: number;
  round_reached: RoundReached;
  year: number;
}
