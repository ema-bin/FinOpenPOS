import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubAltaInput } from "@/lib/clubs/parse-club-alta";

export class ClubAltaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ClubAltaError";
  }
}

const PAYMENT_LISTS = [
  ["courts", "COURT"],
  ["buffet", "BAR"],
  ["classes", "CLASSES"],
  ["tournaments", "TOURNAMENT"],
] as const;

function duplicateUser(message: string): boolean {
  return /already|registered|exists|duplicate/i.test(message);
}

async function discardClub(service: SupabaseClient, clubId: number) {
  const { data: roles } = await service.from("roles").select("id").eq("club_id", clubId);
  const roleIds = (roles ?? []).map((role) => role.id as number);
  if (roleIds.length > 0) {
    await service.from("role_permissions").delete().in("role_id", roleIds);
  }
  await service.from("roles").delete().eq("club_id", clubId);
  await service.from("whatsapp_message_templates").delete().eq("club_id", clubId);
  await service.from("tournament_ranking_point_rules").delete().eq("club_id", clubId);
  await service.from("courts").delete().eq("club_id", clubId);
  await service.from("payment_methods").delete().eq("club_id", clubId);
  await service.from("user_roles").delete().eq("club_id", clubId);
  await service.from("clubs").delete().eq("id", clubId);
}

export async function createClub(
  service: SupabaseClient,
  input: ClubAltaInput,
  actorId: string
): Promise<{ id: number }> {
  const created = await service.auth.admin.createUser({
    email: input.admin.email,
    password: input.admin.password,
    email_confirm: true,
    user_metadata: { full_name: input.admin.name },
  });
  if (created.error || !created.data.user) {
    const message = created.error?.message ?? "No se pudo crear el admin";
    throw new ClubAltaError(
      duplicateUser(message) ? "Ya existe un usuario con ese email" : message,
      duplicateUser(message) ? 409 : 500
    );
  }
  const adminId = created.data.user.id;

  const { data: source, error: sourceError } = await service
    .from("clubs")
    .select("id")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sourceError || !source) {
    await service.auth.admin.deleteUser(adminId);
    throw new ClubAltaError(sourceError?.message ?? "No hay un complejo de origen", 500);
  }

  const { data: club, error: clubError } = await service
    .from("clubs")
    .insert({ ...input.settings, is_active: true })
    .select("id")
    .single();
  if (clubError || !club) {
    await service.auth.admin.deleteUser(adminId);
    throw new ClubAltaError(clubError?.message ?? "No se pudo crear el complejo", 500);
  }
  const clubId = Number(club.id);

  try {
    await copyRoles(service, Number(source.id), clubId, adminId, actorId);
    await copyTemplates(service, Number(source.id), clubId, adminId);
    await copyRankingRules(service, Number(source.id), clubId);
    await insertCourts(service, clubId, adminId, input.courts);
    await insertPayments(service, clubId, adminId, input);
  } catch (error) {
    await discardClub(service, clubId);
    await service.auth.admin.deleteUser(adminId);
    if (error instanceof ClubAltaError) throw error;
    const message = error instanceof Error ? error.message : "No se pudo crear el complejo";
    throw new ClubAltaError(message, 500);
  }

  return { id: clubId };
}

async function copyRoles(
  service: SupabaseClient,
  sourceId: number,
  clubId: number,
  adminId: string,
  actorId: string
) {
  const { data: roles, error } = await service
    .from("roles")
    .select("id, name, description, is_system")
    .eq("club_id", sourceId);
  if (error) throw new ClubAltaError(error.message, 500);
  const sourceRoles = roles ?? [];
  const system = sourceRoles.find((role) => role.is_system);
  if (!system) throw new ClubAltaError("El complejo de origen no tiene un rol Admin", 500);

  const copied = new Map<number, number>();
  for (const role of sourceRoles) {
    const { data: created, error: insertError } = await service
      .from("roles")
      .insert({
        name: role.name,
        description: role.description,
        is_system: role.is_system,
        club_id: clubId,
      })
      .select("id")
      .single();
    if (insertError || !created) throw new ClubAltaError(insertError?.message ?? "No se pudieron copiar los roles", 500);
    copied.set(role.id as number, created.id as number);
  }

  const sourceIds = Array.from(copied.keys());
  const { data: grants, error: grantsError } = await service
    .from("role_permissions")
    .select("role_id, permission, access")
    .in("role_id", sourceIds);
  if (grantsError) throw new ClubAltaError(grantsError.message, 500);
  if ((grants ?? []).length > 0) {
    const { error: copyError } = await service.from("role_permissions").insert(
      (grants ?? []).map((grant) => ({
        role_id: copied.get(grant.role_id as number),
        permission: grant.permission,
        access: grant.access,
      }))
    );
    if (copyError) throw new ClubAltaError(copyError.message, 500);
  }

  const adminRoleId = copied.get(system.id as number);
  const { error: assignError } = await service.from("user_roles").insert({
    user_id: adminId,
    role_id: adminRoleId,
    club_id: clubId,
    assigned_by: actorId,
  });
  if (assignError) throw new ClubAltaError(assignError.message, 500);
}

async function copyTemplates(service: SupabaseClient, sourceId: number, clubId: number, adminId: string) {
  const { data, error } = await service
    .from("whatsapp_message_templates")
    .select("kind, name, body")
    .eq("club_id", sourceId);
  if (error) throw new ClubAltaError(error.message, 500);
  if ((data ?? []).length === 0) return;
  const { error: insertError } = await service.from("whatsapp_message_templates").insert(
    (data ?? []).map((row) => ({
      kind: row.kind,
      name: row.name,
      body: row.body,
      user_uid: adminId,
      club_id: clubId,
    }))
  );
  if (insertError) throw new ClubAltaError(insertError.message, 500);
}

async function copyRankingRules(service: SupabaseClient, sourceId: number, clubId: number) {
  const { data, error } = await service
    .from("tournament_ranking_point_rules")
    .select("round_reached, points, display_order")
    .eq("club_id", sourceId);
  if (error) throw new ClubAltaError(error.message, 500);
  if ((data ?? []).length === 0) return;
  const { error: insertError } = await service.from("tournament_ranking_point_rules").insert(
    (data ?? []).map((row) => ({ ...row, club_id: clubId }))
  );
  if (insertError) throw new ClubAltaError(insertError.message, 500);
}

async function insertCourts(service: SupabaseClient, clubId: number, adminId: string, courts: string[]) {
  const { error } = await service.from("courts").insert(
    courts.map((name) => ({
      name,
      is_active: true,
      user_uid: adminId,
      club_id: clubId,
    }))
  );
  if (error) throw new ClubAltaError(error.message, 500);
}

async function insertPayments(service: SupabaseClient, clubId: number, adminId: string, input: ClubAltaInput) {
  const rows = PAYMENT_LISTS.flatMap(([key, scope]) =>
    input.payments[key].map((name) => ({
      name,
      scope,
      is_active: true,
      consumes_slot_credit: scope === "COURT" && /qr/i.test(name),
      user_uid: adminId,
      club_id: clubId,
    }))
  );
  if (rows.length === 0) return;
  const { error } = await service.from("payment_methods").insert(rows);
  if (error) {
    if (/payment_scope|invalid input value for enum/i.test(error.message)) {
      throw new ClubAltaError("Falta aplicar scripts/add-club-alta.sql en la base.", 503);
    }
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new ClubAltaError(
        "Un medio de pago está repetido. Para usar el mismo nombre en dos listas, corré scripts/add-club-alta.sql.",
        409
      );
    }
    throw new ClubAltaError(error.message, 500);
  }
}
