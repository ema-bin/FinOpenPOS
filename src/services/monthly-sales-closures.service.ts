import type {
  MonthlySalesClosureDTO,
  MonthlySalesClosurePreviewDTO,
} from "@/models/dto/monthly-sales-closure";

class MonthlySalesClosuresService {
  private baseUrl = "/api/monthly-sales-closures";

  async getPreview(yearMonth?: string): Promise<MonthlySalesClosurePreviewDTO> {
    const params = yearMonth ? `?month=${encodeURIComponent(yearMonth)}` : "";
    const response = await fetch(`${this.baseUrl}/preview${params}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo cargar el preview del cierre mensual");
    }
    return response.json();
  }

  async create(input: {
    yearMonth?: string;
    notes?: string;
  }): Promise<MonthlySalesClosureDTO & { replaced?: boolean }> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo registrar el cierre mensual");
    }
    return response.json();
  }

  async list(limit = 24): Promise<MonthlySalesClosureDTO[]> {
    const response = await fetch(`${this.baseUrl}?limit=${limit}`);
    if (!response.ok) {
      throw new Error("No se pudo cargar el historial de cierres mensuales");
    }
    return response.json();
  }

  async getByMonth(yearMonth: string): Promise<MonthlySalesClosureDTO> {
    const response = await fetch(`${this.baseUrl}/${yearMonth}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se encontró el cierre mensual");
    }
    return response.json();
  }
}

export const monthlySalesClosuresService = new MonthlySalesClosuresService();
