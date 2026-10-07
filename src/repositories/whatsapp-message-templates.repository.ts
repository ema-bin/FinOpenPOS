import { BaseRepository } from "./base-repository";
import type {
  WhatsAppMessageTemplateDTO,
  WhatsAppTemplateKind,
} from "@/models/db/whatsapp-message-template";

const SELECT = "id, kind, name, body, created_at, updated_at";

export class WhatsAppMessageTemplatesRepository extends BaseRepository {
  async findByKind(kind: WhatsAppTemplateKind): Promise<WhatsAppMessageTemplateDTO[]> {
    const { data, error } = await this.supabase
      .from("whatsapp_message_templates")
      .select(SELECT)
      .eq("kind", kind)
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch message templates: ${error.message}`);
    }
    return (data ?? []) as WhatsAppMessageTemplateDTO[];
  }

  async create(input: {
    kind: WhatsAppTemplateKind;
    name: string;
    body: string;
  }): Promise<WhatsAppMessageTemplateDTO> {
    const { data, error } = await this.supabase
      .from("whatsapp_message_templates")
      .insert({ ...input, user_uid: this.userId })
      .select(SELECT)
      .single();

    if (error) {
      throw new Error(`Failed to create message template: ${error.message}`);
    }
    return data as WhatsAppMessageTemplateDTO;
  }

  async update(
    id: number,
    updates: Partial<{ name: string; body: string }>
  ): Promise<WhatsAppMessageTemplateDTO | null> {
    const { data, error } = await this.supabase
      .from("whatsapp_message_templates")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update message template: ${error.message}`);
    }
    return (data as WhatsAppMessageTemplateDTO | null) ?? null;
  }

  async delete(id: number): Promise<void> {
    const { error } = await this.supabase
      .from("whatsapp_message_templates")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to delete message template: ${error.message}`);
    }
  }
}
