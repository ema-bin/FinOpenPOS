import { describe, expect, it } from "vitest";
import { accessTokenFromAuthCookies, clubIdFromClaims, isPlatformClaim } from "@/lib/clubs/session-club";

function token(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.sig`;
}

describe("club de la sesión", () => {
  it("lee el club y la marca de plataforma", () => {
    expect(clubIdFromClaims({ app_club_id: 4 })).toBe(4);
    expect(clubIdFromClaims({ app_club_id: null })).toBeNull();
    expect(isPlatformClaim({ app_is_platform: true })).toBe(true);
    expect(isPlatformClaim({ app_is_platform: false })).toBe(false);
  });

  it("saca el token de la cookie de Supabase", () => {
    const access = token({ app_club_id: 1 });
    const session = Buffer.from(JSON.stringify({ access_token: access, refresh_token: "r" })).toString("base64url");
    const cookies = [{ name: "sb-demo-auth-token", value: `base64-${session}` }];
    expect(accessTokenFromAuthCookies(cookies)).toBe(access);
  });
});
