import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decodeJwtPayload } from "@/lib/auth/session-permissions";
import { accessTokenFromAuthCookies, isPlatformClaim } from "@/lib/clubs/session-club";

export class PlatformError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PlatformError";
  }
}

/** Solo quien está en platform_admins. No es un permiso del club. */
export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PlatformError("Unauthorized", 401);

  const token = accessTokenFromAuthCookies(cookies().getAll());
  const claims = token ? decodeJwtPayload(token) : null;
  if (!isPlatformClaim(claims)) throw new PlatformError("No disponible", 404);

  const service = createServiceClient();
  const { data, error } = await service
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new PlatformError(error.message, 500);
  if (!data) throw new PlatformError("No disponible", 404);
  return { userId: user.id };
}
