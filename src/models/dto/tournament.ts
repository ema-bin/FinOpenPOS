// DTOs (Data Transfer Objects) for tournaments
// These types include relations and computed fields for API responses and UI

import type { TournamentStatus, MatchPhase, MatchStatus } from "../db/tournament";
import type { Player } from "../db/player";

// Tournament DTOs
export interface TournamentDTO {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category: string | null; // nombre desde join, para mostrar
  is_puntuable: boolean;
  is_category_specific: boolean;
  is_suma_13_damas: boolean;
  status: TournamentStatus;
  has_super_tiebreak: boolean;
  match_duration: number;
  registration_fee: number;
  start_date?: string | null;
  end_date?: string | null;
}

// Tournament with minimal fields for lists
export interface TournamentListItem {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category: string | null;
  is_puntuable: boolean;
  is_category_specific: boolean;
  is_suma_13_damas: boolean;
  status: TournamentStatus;
}

// Reusable Player nested DTO (shared type)
export type PlayerNestedDTO = {
  id: number;
  first_name: string;
  last_name: string;
};

// Team DTOs
export interface TeamPlayer extends PlayerNestedDTO {}

export interface AvailableSchedule {
  id: number;
  tournament_id: number;
  date: string; // YYYY-MM-DD - Fecha específica
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

export interface TeamDTO {
  id: number;
  display_name: string | null;
  seed_number: number | null;
  player1: TeamPlayer;
  player2: TeamPlayer;
  display_order: number;
  is_substitute: boolean;
  schedule_notes: string | null;
  restricted_slot_ids?: number[]; // IDs de tournament_group_slots en los que el equipo NO puede jugar
  standings?: Array<{
    position: number;
    group?: {
      name: string;
    };
  }>; // Posición y zona del equipo en la fase de grupos
}

// Group DTOs
export interface GroupDTO {
  id: number;
  name: string;
  group_order?: number;
}

export interface GroupTeamDTO {
  id: number;
  tournament_group_id: number;
  team: TeamDTO | null;
}

// Match DTOs
export interface MatchDTO {
  id: number;
  tournament_group_id: number | null;
  phase: MatchPhase;
  status: MatchStatus;
  match_date: string | null;
  start_time: string | null;
  end_time: string | null;
  match_order?: number | null;
  court_id: number | null;
  set1_team1_games: number | null;
  set1_team2_games: number | null;
  set2_team1_games: number | null;
  set2_team2_games: number | null;
  set3_team1_games: number | null;
  set3_team2_games: number | null;
  super_tiebreak_team1_points: number | null;
  super_tiebreak_team2_points: number | null;
  team1: TeamDTO | null;
  team2: TeamDTO | null;
  photo_url?: string | null;
}

// Standing DTOs
export interface StandingDTO {
  id: number;
  tournament_group_id: number;
  team_id: number;
  position: number;
  matches_played: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  team?: TeamDTO; // Optional team relation
}

// Playoff DTOs
export interface PlayoffRow {
  id: number;
  tournament_id: number;
  round: string;
  bracket_pos: number;
  source_team1: string | null;
  source_team2: string | null;
  match: {
    id: number;
    team1_id: number | null;
    team2_id: number | null;
    status: MatchStatus;
    match_date: string | null;
    start_time: string | null;
    end_time: string | null;
    court_id: number | null;
    photo_url?: string | null;
    set1_team1_games: number | null;
    set1_team2_games: number | null;
    set2_team1_games: number | null;
    set2_team2_games: number | null;
    set3_team1_games: number | null;
    set3_team2_games: number | null;
    super_tiebreak_team1_points: number | null;
    super_tiebreak_team2_points: number | null;
    team1: (TeamDTO & {
      standings?: Array<{
        position: number;
        group?: { name: string };
      }>;
    }) | null;
    team2: (TeamDTO & {
      standings?: Array<{
        position: number;
        group?: { name: string };
      }>;
    }) | null;
  } | null;
}

// API Response DTOs
export interface GroupsApiResponse {
  groups: GroupDTO[];
  groupTeams: GroupTeamDTO[];
  matches: MatchDTO[];
  standings?: StandingDTO[];
}

export interface TeamsApiResponse {
  teams: TeamDTO[];
}

export interface PlayoffsApiResponse {
  rows: PlayoffRow[];
}

export interface ApiResponseStandings {
  groups: GroupDTO[];
  standings: StandingDTO[];
  matches: MatchDTO[];
  groupTeams?: GroupTeamDTO[];
}

// Schedule DTOs
export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface ScheduleConfig {
  days: ScheduleDay[];
  matchDuration: number; // minutes
  courtIds: number[];
}

// Tournament Registration Payment DTOs
export interface TournamentRegistrationPaymentDTO {
  id: number | null;
  tournament_id: number;
  tournament_team_id: number;
  player_id: number;
  has_paid: boolean;
  payment_method_id: number | null;
  payment_method?: {
    id: number;
    name: string;
  } | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  player?: {
    id: number;
    first_name: string;
    last_name: string;
  };
  team?: {
    id: number;
    display_name: string | null;
    display_order: number;
  };
}

export interface TournamentPaymentsApiResponse {
  payments: TournamentRegistrationPaymentDTO[];
  registration_fee: number;
}
