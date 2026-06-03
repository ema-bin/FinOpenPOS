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

export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string
): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const text = message.trim();
  const base = `https://wa.me/${normalized}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function personalizeWhatsAppMessage(
  template: string,
  player: { first_name: string; last_name: string }
): string {
  return applyRegistrationMessagePlaceholders(template, player);
}
