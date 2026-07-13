import type {
  DailySalesClosureDTO,
  DailySalesClosurePreviewDTO,
} from "@/models/dto/daily-sales-closure";

class DailySalesClosuresService {
  private baseUrl = "/api/daily-sales-closures";

  async getPreview(businessDate?: string): Promise<DailySalesClosurePreviewDTO> {
    const params = businessDate ? `?date=${encodeURIComponent(businessDate)}` : "";
    const response = await fetch(`${this.baseUrl}/preview${params}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo cargar el preview del cierre");
    }
    return response.json();
  }

  async create(input: {
    businessDate?: string;
    notes?: string;
  }): Promise<DailySalesClosureDTO & { replaced?: boolean }> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo registrar el cierre");
    }
    return response.json();
  }

  async list(limit = 30): Promise<DailySalesClosureDTO[]> {
    const response = await fetch(`${this.baseUrl}?limit=${limit}`);
    if (!response.ok) {
      throw new Error("No se pudo cargar el historial de cierres");
    }
    return response.json();
  }

  async getByDate(businessDate: string): Promise<DailySalesClosureDTO> {
    const response = await fetch(`${this.baseUrl}/${businessDate}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se encontró el cierre");
    }
    return response.json();
  }
}

export const dailySalesClosuresService = new DailySalesClosuresService();
