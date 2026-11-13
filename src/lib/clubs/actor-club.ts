import type { SupabaseClient } from "@supabase/supabase-js";

export class ClubContextError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ClubContextError";
  }
}

function missingClubSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "42P01" || /club_id|relation .*clubs/i.test(error.message ?? "");
}

/** Club del usuario según user_roles. Una persona, un club. */
export async function clubIdForUser(service: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await service
    .from("user_roles")
    .select("club_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (missingClubSchema(error)) {
    throw new ClubContextError("Falta aplicar el script de clubes en la base.", 503);
  }
  if (error) throw new ClubContextError(error.message, 500);
  const clubId = Number(data?.club_id);
  if (!Number.isInteger(clubId) || clubId <= 0) {
    throw new ClubContextError("Tu usuario no está asignado a un complejo.", 403);
  }
  return clubId;
}
