// DTOs for players

import type { PlayerStatus } from "../db/player";

export interface PlayerDTO {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  birth_date: string | null;
  notes: string | null;
  status: PlayerStatus;
  category_id: number | null;
  category: string | null; // nombre desde join
  female_category_id: number | null;
  female_category: string | null; // nombre desde join
  gender: string | null;
}

export interface PlayerListItem {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: PlayerStatus;
  category_id: number | null;
  category: string | null;
  female_category_id: number | null;
  female_category: string | null;
  gender: string | null;
}

