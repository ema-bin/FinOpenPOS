export type RankingRoundReached =
  | "groups"
  | "16avos"
  | "octavos"
  | "cuartos"
  | "semifinal"
  | "final"
  | "champion";

export interface TournamentRankingPointRule {
  id: number;
  round_reached: RankingRoundReached;
  points: number;
  display_order: number;
}
