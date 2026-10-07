import type {
  WhatsAppMessageTemplateDTO,
  WhatsAppTemplateKind,
} from "@/models/db/whatsapp-message-template";

async function parseOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? fallback);
  }
  return response.json();
}

class WhatsAppMessageTemplatesService {
  private baseUrl = "/api/whatsapp-message-templates";

  async getByKind(kind: WhatsAppTemplateKind): Promise<WhatsAppMessageTemplateDTO[]> {
    const response = await fetch(`${this.baseUrl}?kind=${encodeURIComponent(kind)}`);
    return parseOrThrow(response, "Error al cargar las variantes de mensaje");
  }

  async create(input: {
    kind: WhatsAppTemplateKind;
    name: string;
    body: string;
  }): Promise<WhatsAppMessageTemplateDTO> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return parseOrThrow(response, "Error al crear la variante");
  }

  async update(
    id: number,
    updates: Partial<{ name: string; body: string }>
  ): Promise<WhatsAppMessageTemplateDTO> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return parseOrThrow(response, "Error al guardar la variante");
  }

  async delete(id: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? "Error al eliminar la variante");
    }
  }
}

export const whatsappMessageTemplatesService = new WhatsAppMessageTemplatesService();
