import type { AdvertisementDTO } from "@/models/dto/advertisement";

type CreateAdvertisementInput = {
  name: string;
  image_url: string;
  target_url?: string | null;
  description?: string | null;
  ordering?: number;
  is_active?: boolean;
};

type UpdateAdvertisementInput = Partial<{
  name: string;
  image_url: string;
  target_url: string | null;
  description: string | null;
  ordering: number;
  is_active: boolean;
}>;

export type AdvertisementStatusFilter = "active" | "inactive" | "all";

class AdvertisementsService {
  private baseUrl = "/api/advertisements";

  async getAll(status: AdvertisementStatusFilter = "active"): Promise<AdvertisementDTO[]> {
    const params = new URLSearchParams();
    params.set("status", status);
    const response = await fetch(`${this.baseUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Error loading advertisements");
    }
    return response.json();
  }

  async getById(id: number): Promise<AdvertisementDTO> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    if (!response.ok) {
      throw new Error("Advertisement not found");
    }
    return response.json();
  }

  async create(input: CreateAdvertisementInput): Promise<AdvertisementDTO> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Error creating advertisement");
    }

    return response.json();
  }

  async update(id: number, input: UpdateAdvertisementInput): Promise<AdvertisementDTO> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Error updating advertisement");
    }

    return response.json();
  }

  async deactivate(id: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Error deactivating advertisement");
    }
  }
}

export const advertisementsService = new AdvertisementsService();

