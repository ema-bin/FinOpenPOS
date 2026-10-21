import type {
  ClassCharge,
  ClassPaymentMethodRef,
  ClassProfessor,
  ClassSchedule,
  ClassSession,
  MissingClassRateView,
} from "@/models/db/class";

async function parse<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : fallback);
  }
  return data as T;
}

class ClassesService {
  async listProfessors(): Promise<{
    professors: ClassProfessor[];
    paymentMethods: ClassPaymentMethodRef[];
    cashPaymentMethod: ClassPaymentMethodRef | null;
    cintiaPaymentMethod: ClassPaymentMethodRef | null;
  }> {
    const response = await fetch("/api/classes/professors");
    return parse(response, "No se pudieron cargar los profesores");
  }

  async createProfessor(input: { name: string; phone?: string; paymentMethodId: number }) {
    const response = await fetch("/api/classes/professors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return parse<ClassProfessor>(response, "No se pudo crear el profesor");
  }

  async updateProfessor(
    id: number,
    input: {
      name?: string;
      phone?: string | null;
      paymentMethodId?: number;
      paymentAccount?: string | null;
      isActive?: boolean;
    }
  ) {
    const response = await fetch(`/api/classes/professors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await parse(response, "No se pudo actualizar el profesor");
  }

  async saveRate(professorId: number, weeklyCount: number, monthlyAmount: number) {
    const response = await fetch(`/api/classes/professors/${professorId}/rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyCount, monthlyAmount }),
    });
    await parse(response, "No se pudo guardar la tarifa");
  }

  async deleteRate(id: number) {
    const response = await fetch(`/api/classes/rates/${id}`, { method: "DELETE" });
    await parse(response, "No se pudo borrar la tarifa");
  }

  async listSchedules(): Promise<ClassSchedule[]> {
    const response = await fetch("/api/classes/schedules");
    return parse(response, "No se pudieron cargar las clases");
  }

  async createSchedule(input: {
    professorId: number;
    courtId: number;
    weekday: number;
    startTime: string;
    name?: string;
    playerIds?: number[];
  }): Promise<{ id: number }> {
    const response = await fetch("/api/classes/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return parse(response, "No se pudo crear la clase");
  }

  async updateSchedule(
    id: number,
    input: {
      professorId?: number;
      courtId?: number;
      weekday?: number;
      startTime?: string;
      name?: string | null;
      isActive?: boolean;
    }
  ) {
    const response = await fetch(`/api/classes/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await parse(response, "No se pudo actualizar la clase");
  }

  async addEnrollment(scheduleId: number, playerId: number) {
    const response = await fetch(`/api/classes/schedules/${scheduleId}/enrollments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    await parse(response, "No se pudo anotar al jugador");
  }

  async endEnrollment(id: number) {
    const response = await fetch(`/api/classes/enrollments/${id}`, { method: "DELETE" });
    await parse(response, "No se pudo quitar al jugador");
  }

  async listSessions(from: string, to: string): Promise<ClassSession[]> {
    const response = await fetch(`/api/classes/sessions?from=${from}&to=${to}`);
    return parse(response, "No se pudo armar el calendario");
  }

  async updateSession(
    id: number,
    input: { courtId?: number; status?: "scheduled" | "cancelled"; reset?: boolean }
  ) {
    const response = await fetch(`/api/classes/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await parse(response, "No se pudo actualizar el día");
  }

  async setSessionPlayers(id: number, playerIds: number[]) {
    const response = await fetch(`/api/classes/sessions/${id}/players`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerIds }),
    });
    await parse(response, "No se pudieron guardar los integrantes");
  }

  async listCharges(month: string): Promise<{ charges: ClassCharge[]; closedProfessorIds: number[] }> {
    const response = await fetch(`/api/classes/charges?month=${month}`);
    return parse(response, "No se pudieron cargar los cobros");
  }

  async updatePayment(id: number, amount: number, paymentMethodId: number): Promise<ClassCharge> {
    const response = await fetch(`/api/classes/charges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, paymentMethodId }),
    });
    return parse(response, "No se pudo editar el pago");
  }

  async updateChargeAmount(id: number, amount: number): Promise<ClassCharge> {
    const response = await fetch(`/api/classes/charges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    return parse(response, "No se pudo cambiar el monto");
  }

  async setMonthClosed(month: string, professorId: number, closed: boolean): Promise<void> {
    const response = await fetch("/api/classes/charges/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: month, professorId, closed }),
    });
    await parse(response, closed ? "No se pudo cerrar el mes" : "No se pudo reabrir el mes");
  }

  async generateCharges(yearMonth: string): Promise<{
    charges: ClassCharge[];
    missing: MissingClassRateView[];
  }> {
    const response = await fetch("/api/classes/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth }),
    });
    return parse(response, "No se pudieron armar las deudas");
  }

  async payCharge(id: number, paymentMethodId: number): Promise<ClassCharge> {
    const response = await fetch(`/api/classes/charges/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodId }),
    });
    return parse(response, "No se pudo registrar el pago");
  }
}

export const classesService = new ClassesService();

export function formatPesos(amount: number): string {
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
