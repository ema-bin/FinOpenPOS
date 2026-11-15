import { decodeJwtPayload } from "@/lib/auth/session-permissions";

export function clubIdFromClaims(claims: Record<string, unknown> | null | undefined): number | null {
  const value = Number(claims?.app_club_id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function isPlatformClaim(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.app_is_platform === true;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return decodeURIComponent(
    Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
  );
}

/** Arma el access token guardado por Supabase en las cookies de la sesión. */
export function accessTokenFromAuthCookies(cookies: { name: string; value: string }[]): string | null {
  const parts = cookies
    .filter((cookie) => cookie.name.includes("-auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) return null;

  let raw = parts.map((cookie) => cookie.value).join("");
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // La cookie ya venía decodificada.
  }
  if (raw.startsWith("base64-")) {
    try {
      raw = decodeBase64Url(raw.slice("base64-".length));
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(raw) as { access_token?: unknown } | unknown[];
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
    if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
  } catch {
    return null;
  }
  return null;
}

export function clubIdFromAuthCookies(cookies: { name: string; value: string }[]): number | null {
  const token = accessTokenFromAuthCookies(cookies);
  if (!token) return null;
  return clubIdFromClaims(decodeJwtPayload(token));
}
