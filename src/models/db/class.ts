export type ClassPaymentMethodRef = { id: number; name: string; account?: string | null };

export type ClassRate = {
  id: number;
  weekly_count: number;
  monthly_amount: number;
};

export type ClassProfessor = {
  id: number;
  name: string;
  phone: string | null;
  payment_method_id: number | null;
  is_active: boolean;
  payment_method: ClassPaymentMethodRef | null;
  rates: ClassRate[];
};

export type ClassPlayerRef = {
  id: number;
  first_name: string;
  last_name: string;
  phone?: string | null;
};

export type ClassEnrollment = {
  id: number;
  player_id: number;
  started_on: string;
  ended_on: string | null;
  player: ClassPlayerRef | null;
};

export type ClassSchedule = {
  id: number;
  professor_id: number;
  court_id: number;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  name: string | null;
  is_active: boolean;
  professor: { id: number; name: string } | null;
  court: { id: number; name: string } | null;
  enrollments: ClassEnrollment[];
};

export type ClassSessionPlayer = {
  player_id: number;
  first_name: string;
  last_name: string;
};

export type ClassSession = {
  id: number;
  schedule_id: number;
  session_date: string;
  court_id: number;
  start_time: string;
  end_time: string;
  professor_id: number;
  status: "scheduled" | "cancelled";
  roster_customized: boolean;
  detached: boolean;
  professor: { id: number; name: string } | null;
  court: { id: number; name: string } | null;
  schedule: { id: number; name: string | null; weekday: number } | null;
  players: ClassSessionPlayer[];
};

export type ClassCharge = {
  id: number;
  player_id: number;
  professor_id: number;
  year_month: string;
  weekly_count: number;
  amount: number;
  professor_share: number | null;
  partners_share: number | null;
  emanuel_share: number | null;
  status: "pending" | "paid";
  paid_at: string | null;
  payment_method: ClassPaymentMethodRef | null;
  player: ClassPlayerRef | null;
  professor: { id: number; name: string } | null;
};

export type MissingClassRateView = {
  player_id: number;
  professor_id: number;
  player_name: string;
  professor_name: string;
  weekly_count: number;
};
