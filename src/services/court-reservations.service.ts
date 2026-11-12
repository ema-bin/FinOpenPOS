import type { CourtFixedBooking, CourtReservationSlot } from "@/repositories/court-reservations.repository";

async function readError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401 || response.status === 403) {
    throw new Error("No tenés permiso para esto.");
  }
  if (response.status === 404) {
    throw new Error("Las reservas no están habilitadas.");
  }
  const data = await response.json().catch(() => ({}));
  throw new Error(typeof data.error === "string" ? data.error : fallback);
}

export type ReservationClassSession = {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "cancelled";
};

export type ReservationSlotView = CourtReservationSlot & {
  class_block: { label: string } | null;
  tournament_block: { label: string } | null;
  class_sessions?: ReservationClassSession[];
};

class CourtReservationsService {
  async day(date: string): Promise<ReservationSlotView[]> {
    const response = await fetch(`/api/court-reservations?date=${date}`);
    if (!response.ok) await readError(response, "No se pudieron cargar las reservas");
    return response.json();
  }

  async releaseClass(slotId: number, sessionId: number): Promise<void> {
    const response = await fetch("/api/court-reservations/release-class", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: slotId, session_id: sessionId }),
    });
    if (!response.ok) await readError(response, "No se pudo cancelar la clase");
  }

  async restoreClass(slotId: number, sessionId: number): Promise<void> {
    const response = await fetch("/api/court-reservations/restore-class", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: slotId, session_id: sessionId }),
    });
    if (!response.ok) await readError(response, "No se pudo restaurar la clase");
  }

  async reserve(slotId: number, playerId: number): Promise<void> {
    const response = await fetch("/api/court-reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: slotId, player_id: playerId }),
    });
    if (!response.ok) await readError(response, "No se pudo reservar");
  }

  async setPlayer(slotId: number, playerId: number): Promise<void> {
    const response = await fetch(`/api/court-reservations/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId }),
    });
    if (!response.ok) await readError(response, "No se pudo cambiar el jugador");
  }

  async cancel(slotId: number): Promise<void> {
    const response = await fetch(`/api/court-reservations/${slotId}`, { method: "DELETE" });
    if (!response.ok) await readError(response, "No se pudo cancelar la reserva");
  }

  async generateWeek(monday: string): Promise<void> {
    const response = await fetch("/api/court-reservations/generate-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monday }),
    });
    if (!response.ok) await readError(response, "No se pudo generar la semana");
  }

  async fixedBookings(): Promise<CourtFixedBooking[]> {
    const response = await fetch("/api/court-fixed-bookings");
    if (!response.ok) await readError(response, "No se pudieron cargar los turnos fijos");
    return response.json();
  }

  async saveFixed(input: {
    id?: number | null;
    player_id: number;
    court_id: number;
    weekday: number;
    start_time: string;
    end_time: string;
    valid_from: string;
    valid_until: string | null;
    is_active: boolean;
    suspended_from: string | null;
    suspended_until: string | null;
  }): Promise<void> {
    const response = await fetch(input.id ? `/api/court-fixed-bookings/${input.id}` : "/api/court-fixed-bookings", {
      method: input.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) await readError(response, "No se pudo guardar el turno fijo");
  }

  async deactivateFixed(id: number): Promise<void> {
    const response = await fetch(`/api/court-fixed-bookings/${id}`, { method: "DELETE" });
    if (!response.ok) await readError(response, "No se pudo desactivar el turno fijo");
  }

  async cancelFixedDate(id: number, date: string): Promise<void> {
    const response = await fetch(`/api/court-fixed-bookings/${id}/exceptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!response.ok) await readError(response, "No se pudo cancelar esa fecha");
  }
}

export const courtReservationsService = new CourtReservationsService();
