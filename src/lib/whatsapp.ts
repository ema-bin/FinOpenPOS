import { applyRegistrationMessagePlaceholders } from "@/lib/tournament-registration-notifications";

/**
 * Normaliza un teléfono argentino para enlaces wa.me (solo dígitos, con código país 54).
 */
export function normalizePhoneForWhatsApp(
  phone: string | null | undefined
): string | null {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("54")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `54${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("9")) {
    return `54${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 13) {
    return `54${digits}`;
  }
  return null;
}

export type WhatsAppLinkTarget = "app" | "web";

/**
 * Enlace para abrir un chat con mensaje prefilled.
 * - `app` (default): protocolo whatsapp:// → WhatsApp Desktop / app nativa, sin pestaña del navegador.
 * - `web`: wa.me → útil en móvil o si no tenés la app instalada.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
  target: WhatsAppLinkTarget = "app"
): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const text = message.trim();

  if (target === "web") {
    const base = `https://wa.me/${normalized}`;
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  }

  const params = new URLSearchParams();
  params.set("phone", normalized);
  if (text) params.set("text", text);
  return `whatsapp://send?${params.toString()}`;
}

/** En móvil conviene wa.me; en admin (escritorio) whatsapp:// */
export function defaultWhatsAppLinkTarget(): WhatsAppLinkTarget {
  if (typeof navigator === "undefined") return "app";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    ? "web"
    : "app";
}

export function personalizeWhatsAppMessage(
  template: string,
  player: { first_name: string; last_name: string },
  options?: { categoryName?: string | null }
): string {
  return applyRegistrationMessagePlaceholders(template, player, options);
}
