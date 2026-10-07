export const WHATSAPP_TEMPLATE_KINDS = ["tournament_invite", "debt_reminder"] as const;

export type WhatsAppTemplateKind = (typeof WHATSAPP_TEMPLATE_KINDS)[number];

export interface WhatsAppMessageTemplateDB {
  id: number;
  kind: WhatsAppTemplateKind;
  name: string;
  body: string;
  user_uid: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppMessageTemplateDTO = Omit<WhatsAppMessageTemplateDB, "user_uid">;

export function isWhatsAppTemplateKind(value: unknown): value is WhatsAppTemplateKind {
  return (
    typeof value === "string" &&
    (WHATSAPP_TEMPLATE_KINDS as readonly string[]).includes(value)
  );
}
