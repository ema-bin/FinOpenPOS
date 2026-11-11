import type {
  SlotCreditMovementRow,
  SlotCreditPlayerRow,
} from "@/repositories/slot-credits.repository";

async function readError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401 || response.status === 403) {
    throw new Error("No tenés permiso para esto.");
  }
  const data = await response.json().catch(() => ({}));
  throw new Error(typeof data.error === "string" ? data.error : fallback);
}

class SlotCreditsService {
  async listPlayers(): Promise<SlotCreditPlayerRow[]> {
    const response = await fetch("/api/slot-packs");
    if (!response.ok) await readError(response, "No se pudieron cargar los packs");
    return response.json();
  }

  async balances(playerIds: number[]): Promise<{ player_id: number; balance: number }[]> {
    if (playerIds.length === 0) return [];
    const response = await fetch(`/api/slot-credits?playerIds=${playerIds.join(",")}`);
    if (!response.ok) await readError(response, "No se pudieron cargar los créditos");
    const data = await response.json();
    return data.balances ?? [];
  }

  async movements(playerId: number): Promise<SlotCreditMovementRow[]> {
    const response = await fetch(`/api/slot-credits/movements?playerId=${playerId}`);
    if (!response.ok) await readError(response, "No se pudo cargar el historial");
    return response.json();
  }

  async grant(input: {
    player_id: number;
    name: string;
    credits: number;
    amount_paid: number;
    payment_method_id: number | null;
    sold_at: string;
    notes: string | null;
  }): Promise<void> {
    const response = await fetch("/api/slot-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) await readError(response, "No se pudo asignar el pack");
  }

  async adjust(input: { player_id: number; delta: number; reason: string }): Promise<void> {
    const response = await fetch("/api/slot-credits/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) await readError(response, "No se pudo ajustar el saldo");
  }
}

export const slotCreditsService = new SlotCreditsService();
