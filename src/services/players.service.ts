import type { PlayerDTO } from "@/models/dto/player";
import type {
  PlayerStatus,
  PlayerStatusFilter,
} from "@/models/db/player";
import type { PlayerDuplicateSuggestion } from "@/lib/player-duplicate-suggestions";

export interface CreatePlayerInput {
  first_name: string;
  last_name: string;
  phone: string;
  status?: PlayerStatus;
  city?: string | null;
  category_id?: number | null;
  female_category_id?: number | null;
  gender?: string | null;
}

export interface UpdatePlayerInput {
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: PlayerStatus;
  city?: string | null;
  category_id?: number | null;
  female_category_id?: number | null;
  gender?: string | null;
}

class PlayersService {
  private baseUrl = "/api/players";

  async getAll(status: PlayerStatusFilter = "active"): Promise<PlayerDTO[]> {
    const params = new URLSearchParams();
    params.set("status", status);
    const url = `${this.baseUrl}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch players");
    }
    return response.json();
  }

  async getById(id: number): Promise<PlayerDTO> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    if (!response.ok) {
      throw new Error("Failed to fetch player");
    }
    return response.json();
  }

  async getDuplicateSuggestions(input: {
    first_name: string;
    last_name: string;
    phone: string;
    exclude_id?: number | null;
  }): Promise<{ suggestions: PlayerDuplicateSuggestion[] }> {
    const params = new URLSearchParams({
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone,
    });
    if (input.exclude_id != null) {
      params.set("exclude_id", String(input.exclude_id));
    }
    const response = await fetch(
      `${this.baseUrl}/duplicate-suggestions?${params.toString()}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch duplicate suggestions");
    }
    return response.json();
  }

  async create(input: CreatePlayerInput): Promise<PlayerDTO> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error("Error creating player");
    }
    return response.json();
  }

  async update(id: number, input: UpdatePlayerInput): Promise<PlayerDTO> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error("Error updating player");
    }
    return response.json();
  }

  async delete(id: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Error deleting player");
    }
  }
}

export const playersService = new PlayersService();

