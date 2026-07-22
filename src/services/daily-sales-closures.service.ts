import type {
  DailySalesClosureDTO,
  DailySalesClosurePreviewDTO,
} from "@/models/dto/daily-sales-closure";
import { enumerateBusinessDates } from "@/lib/business-day";

export type DailySalesClosuresBackfillResult = {
  ok: boolean;
  fromDate: string;
  toDate: string;
  totalDays: number;
  created: Array<{ businessDate: string; totalSales: number }>;
  skipped: string[];
  replaced: Array<{ businessDate: string; totalSales: number }>;
  errors: Array<{ businessDate: string; error: string }>;
};

export type DailySalesClosuresBackfillProgress = {
  current: number;
  total: number;
  businessDate: string;
  action: "processing" | "skipped" | "created" | "replaced" | "error";
  detail?: string;
  created: number;
  skipped: number;
  replaced: number;
  errors: number;
};

const baseUrl = "/api/daily-sales-closures";

export const dailySalesClosuresService = {
  async getPreview(businessDate?: string): Promise<DailySalesClosurePreviewDTO> {
    const params = businessDate ? `?date=${encodeURIComponent(businessDate)}` : "";
    const response = await fetch(`${baseUrl}/preview${params}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo cargar el preview del cierre");
    }
    return response.json();
  },

  async create(input: {
    businessDate?: string;
    notes?: string;
  }): Promise<DailySalesClosureDTO & { replaced?: boolean }> {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo registrar el cierre");
    }
    return response.json();
  },

  async list(limit = 30): Promise<DailySalesClosureDTO[]> {
    const response = await fetch(`${baseUrl}?limit=${limit}`);
    if (!response.ok) {
      throw new Error("No se pudo cargar el historial de cierres");
    }
    return response.json();
  },

  async getByDate(businessDate: string): Promise<DailySalesClosureDTO> {
    const response = await fetch(`${baseUrl}/${businessDate}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "No se encontró el cierre");
    }
    return response.json();
  },

  async backfillRange(input: {
    fromDate: string;
    toDate: string;
    notes?: string;
    skipExisting?: boolean;
  }): Promise<DailySalesClosuresBackfillResult> {
    return this.backfillRangeWithProgress(input, () => {});
  },

  async backfillRangeWithProgress(
    input: {
      fromDate: string;
      toDate: string;
      notes?: string;
      skipExisting?: boolean;
    },
    onProgress: (progress: DailySalesClosuresBackfillProgress) => void
  ): Promise<DailySalesClosuresBackfillResult> {
    const dates = enumerateBusinessDates(input.fromDate, input.toDate);
    const skipExisting = input.skipExisting !== false;
    const notes = input.notes?.trim() || undefined;

    let existingDates = new Set<string>();
    if (skipExisting) {
      const closures = await this.list(Math.min(Math.max(dates.length + 30, 100), 400));
      existingDates = new Set(closures.map((row) => row.business_date));
    }

    const created: DailySalesClosuresBackfillResult["created"] = [];
    const skipped: string[] = [];
    const replaced: DailySalesClosuresBackfillResult["replaced"] = [];
    const errors: DailySalesClosuresBackfillResult["errors"] = [];

    for (let index = 0; index < dates.length; index++) {
      const businessDate = dates[index];
      const baseProgress = {
        current: index + 1,
        total: dates.length,
        businessDate,
        created: created.length,
        skipped: skipped.length,
        replaced: replaced.length,
        errors: errors.length,
      };

      onProgress({ ...baseProgress, action: "processing" });

      if (skipExisting && existingDates.has(businessDate)) {
        skipped.push(businessDate);
        onProgress({
          ...baseProgress,
          skipped: skipped.length,
          action: "skipped",
          detail: "Ya tenía cierre",
        });
        continue;
      }

      try {
        const closure = await this.create({ businessDate, notes });
        const entry = { businessDate, totalSales: closure.total_sales };
        if (closure.replaced) {
          replaced.push(entry);
          onProgress({
            ...baseProgress,
            replaced: replaced.length,
            action: "replaced",
            detail: `$${closure.total_sales.toFixed(2)}`,
          });
        } else {
          created.push(entry);
          onProgress({
            ...baseProgress,
            created: created.length,
            action: "created",
            detail: `$${closure.total_sales.toFixed(2)}`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        errors.push({ businessDate, error: message });
        onProgress({
          ...baseProgress,
          errors: errors.length,
          action: "error",
          detail: message,
        });
      }
    }

    return {
      ok: errors.length === 0,
      fromDate: input.fromDate,
      toDate: input.toDate,
      totalDays: dates.length,
      created,
      skipped,
      replaced,
      errors,
    };
  },
};
