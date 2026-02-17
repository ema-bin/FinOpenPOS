// Database models for players

export type PlayerStatus = "active" | "inactive";

export interface Player {
  id: number;
  user_uid: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null; // DATE
  notes: string | null;
  status: PlayerStatus;
  category_id: number | null;
  female_category_id: number | null;
  gender: string | null; // ej: "male", "female"
  created_at: string; // TIMESTAMP
}

// Input types for creating/updating entities
export interface CreatePlayerInput {
  first_name: string;
  last_name: string;
  phone: string | null;
  status?: PlayerStatus;
  category_id?: number | null;
  female_category_id?: number | null;
  gender?: string | null;
}

export type PlayerStatusFilter = PlayerStatus | "all";

export interface FindPlayersOptions {
  status?: PlayerStatusFilter;
  onlyActive?: boolean;
  search?: string;
}

