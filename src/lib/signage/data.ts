import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClubSchedule } from "@/lib/clubs/load-club";
import { createServiceClient } from "@/lib/supabase/service";
import { SignageError, isMissingSignageTable } from "@/lib/signage/guard";
import {
  localSignageClock,
  promotionIsLive,
  resolvePlayback,
  schedulesConflict,
  type SignageSchedule,
} from "@/lib/signage/resolve";

type Row = Record<string, unknown>;

function text(value: unknown, label: string, max: number, required = true): string {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (!cleaned && required) throw new SignageError(`Completá ${label}`);
  if (cleaned.length > max) throw new SignageError(`${label} es demasiado largo`);
  return cleaned;
}

function clock(value: unknown, label: string): string {
  const cleaned = typeof value === "string" ? value.trim().slice(0, 5) : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) throw new SignageError(`${label} no es un horario válido`);
  return cleaned;
}

function day(value: unknown): string | null {
  if (value == null || value === "") return null;
  const cleaned = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) throw new SignageError("La fecha no es válida");
  return cleaned;
}

function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "pantalla";
}

async function assertOwned(supabase: SupabaseClient, table: string, id: number, label: string) {
  const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  throwDb(error);
  if (!data) throw new SignageError(label, 404);
}

function throwDb(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (isMissingSignageTable(error)) throw new SignageError("Falta aplicar scripts/add-signage.sql en la base.", 503);
  if (error.code === "23503") throw new SignageError("Está usada en una pantalla o una programación", 409);
  if (error.code === "23505") throw new SignageError("Ese nombre o ese orden ya existe", 409);
  throw new SignageError(error.message || "No se pudo guardar", 500);
}

function scheduleOf(row: Row): SignageSchedule {
  return {
    id: Number(row.id),
    playlistId: Number(row.playlist_id),
    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [],
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    priority: Number(row.priority) || 0,
    isActive: Boolean(row.is_active),
  };
}

function promoOf(row: Row) {
  return {
    id: Number(row.id),
    name: String(row.name),
    title: String(row.title ?? ""),
    description: row.description == null ? "" : String(row.description),
    imageUrl: String(row.image_url),
    price: row.price == null ? null : Number(row.price),
    highlight: row.highlight == null ? "" : String(row.highlight),
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    isActive: Boolean(row.is_active),
    contentType: row.content_type === "promo_card" ? "promo_card" : "full_image",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listPromotions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("signage_promotions")
    .select("id, name, title, description, image_url, price, highlight, starts_on, ends_on, is_active, content_type, created_at, updated_at")
    .order("name");
  throwDb(error);
  return (data ?? []).map((row) => promoOf(row as Row));
}

export async function savePromotion(supabase: SupabaseClient, userId: string, body: Record<string, unknown>, id?: number) {
  const contentType = body.content_type === "promo_card" ? "promo_card" : "full_image";
  const name = text(body.name, "el nombre", 120);
  const title = text(body.title, "el título", 160, contentType === "promo_card");
  const imageUrl = text(body.image_url, "la imagen", 2000);
  const price = body.price == null || body.price === "" ? null : Number(body.price);
  if (price != null && (!Number.isFinite(price) || price < 0)) throw new SignageError("El precio no es válido");
  const startsOn = day(body.starts_on);
  const endsOn = day(body.ends_on);
  if (startsOn && endsOn && endsOn < startsOn) throw new SignageError("La vigencia termina antes de empezar");
  const row = {
    user_uid: userId,
    name,
    title,
    description: text(body.description, "la descripción", 500, false) || null,
    image_url: imageUrl,
    price,
    highlight: text(body.highlight, "el destacado", 80, false) || null,
    starts_on: startsOn,
    ends_on: endsOn,
    is_active: body.is_active !== false,
    content_type: contentType,
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase.from("signage_promotions").update(row).eq("id", id).select("id").maybeSingle()
    : supabase.from("signage_promotions").insert(row).select("id").single();
  const { data, error } = await query;
  throwDb(error);
  if (!data) throw new SignageError("No se encontró la promoción", 404);
  return { id: Number((data as { id: number }).id) };
}

export async function deletePromotion(supabase: SupabaseClient, id: number) {
  const { error } = await supabase.from("signage_promotions").delete().eq("id", id);
  throwDb(error);
}

export async function listPlaylists(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("signage_playlists")
    .select("id, name, description, is_active, transition, updated_at")
    .order("name");
  throwDb(error);
  const { data: items, error: itemsError } = await supabase
    .from("signage_playlist_items")
    .select("id, playlist_id, promotion_id, position, duration_seconds")
    .order("position");
  throwDb(itemsError);
  const promotions = await listPromotions(supabase);
  const byId = new Map(promotions.map((promo) => [promo.id, promo]));
  return (data ?? []).map((playlist) => ({
    id: Number(playlist.id),
    name: String(playlist.name),
    description: playlist.description == null ? "" : String(playlist.description),
    isActive: Boolean(playlist.is_active),
    transition: playlist.transition === "cut" ? "cut" : "fade",
    updatedAt: String(playlist.updated_at),
    items: (items ?? [])
      .filter((item) => Number(item.playlist_id) === Number(playlist.id))
      .map((item) => ({
        id: Number(item.id),
        promotionId: Number(item.promotion_id),
        position: Number(item.position),
        durationSeconds: Number(item.duration_seconds),
        promotion: byId.get(Number(item.promotion_id)) ?? null,
      })),
  }));
}

export async function savePlaylist(supabase: SupabaseClient, userId: string, body: Record<string, unknown>, id?: number): Promise<{ id: number }> {
  if (!id && body.duplicate_of != null) return duplicatePlaylist(supabase, userId, Number(body.duplicate_of), body.name);
  const row = {
    user_uid: userId,
    name: text(body.name, "el nombre", 120),
    description: text(body.description, "la descripción", 300, false) || null,
    is_active: body.is_active !== false,
    transition: body.transition === "cut" ? "cut" : "fade",
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase.from("signage_playlists").update(row).eq("id", id).select("id").maybeSingle()
    : supabase.from("signage_playlists").insert(row).select("id").single();
  const { data, error } = await query;
  throwDb(error);
  if (!data) throw new SignageError("No se encontró la lista", 404);
  return { id: Number((data as { id: number }).id) };
}

async function duplicatePlaylist(supabase: SupabaseClient, userId: string, sourceId: number, name: unknown): Promise<{ id: number }> {
  const lists = await listPlaylists(supabase);
  const source = lists.find((list) => list.id === sourceId);
  if (!source) throw new SignageError("No se encontró la lista", 404);
  const created = await savePlaylist(supabase, userId, {
    name: text(name, "el nombre", 120, false) || `${source.name} copia`,
    description: source.description,
    is_active: source.isActive,
    transition: source.transition,
  });
  await replaceItems(supabase, created.id, source.items.map((item) => ({
    promotionId: item.promotionId,
    durationSeconds: item.durationSeconds,
  })));
  return created;
}

export async function deletePlaylist(supabase: SupabaseClient, id: number) {
  const { error } = await supabase.from("signage_playlists").delete().eq("id", id);
  throwDb(error);
}

export async function replaceItems(
  supabase: SupabaseClient,
  playlistId: number,
  items: Array<{ promotionId: number; durationSeconds: number }>
) {
  const seen = new Set<number>();
  const rows = items.map((item, index) => {
    const promotionId = Number(item.promotionId);
    const duration = Number(item.durationSeconds);
    if (!Number.isInteger(promotionId) || promotionId <= 0) throw new SignageError("Elegí una promoción");
    if (seen.has(promotionId)) throw new SignageError("La promoción ya está en la lista");
    seen.add(promotionId);
    if (!Number.isInteger(duration) || duration < 3 || duration > 180) {
      throw new SignageError("La duración tiene que estar entre 3 y 180 segundos");
    }
    return { playlist_id: playlistId, promotion_id: promotionId, position: index, duration_seconds: duration };
  });
  const { error: deleteError } = await supabase.from("signage_playlist_items").delete().eq("playlist_id", playlistId);
  throwDb(deleteError);
  if (rows.length === 0) return;
  const { data: promos, error: promoError } = await supabase.from("signage_promotions").select("id").in("id", rows.map((row) => row.promotion_id));
  throwDb(promoError);
  if ((promos ?? []).length !== rows.length) throw new SignageError("Elegí una promoción del complejo", 404);
  const { error } = await supabase.from("signage_playlist_items").insert(rows);
  throwDb(error);
}

export async function listScreens(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("signage_screens")
    .select("id, name, slug, location, is_active, default_playlist_id, playback_token, last_seen_at, updated_at")
    .order("name");
  throwDb(error);
  const playback = await loadPlaybackContext(supabase);
  const today = localSignageClock(playback.now, playback.timeZone).date;
  return (data ?? []).map((screen) => {
    const choice = resolvePlayback({
      ...playback,
      defaultPlaylistId: screen.default_playlist_id == null ? null : Number(screen.default_playlist_id),
      override: playback.overrides.get(Number(screen.id)) ?? null,
      schedules: playback.schedules.filter((item) => item.screenId === Number(screen.id)),
    });
    return {
      id: Number(screen.id),
      name: String(screen.name),
      slug: String(screen.slug),
      location: screen.location == null ? "" : String(screen.location),
      isActive: Boolean(screen.is_active),
      defaultPlaylistId: screen.default_playlist_id == null ? null : Number(screen.default_playlist_id),
      playbackToken: String(screen.playback_token),
      lastSeenAt: screen.last_seen_at ? String(screen.last_seen_at) : null,
      today,
      now: {
        source: choice.source,
        playlistId: choice.playlistId,
        playlistName: playback.playlistNames.get(choice.playlistId ?? 0) ?? null,
      },
    };
  });
}

export async function saveScreen(supabase: SupabaseClient, userId: string, body: Record<string, unknown>, id?: number) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (!id || body.name != null) {
    const name = text(body.name, "el nombre", 120);
    row.name = name;
    if (!id || body.slug != null) row.slug = text(body.slug, "el identificador", 40, false) || slugify(name);
  }
  if (!id || body.location != null) row.location = text(body.location, "el lugar", 160, false) || null;
  if (!id || body.is_active != null) row.is_active = body.is_active !== false;
  if (!id || "default_playlist_id" in body) {
    const playlistId = body.default_playlist_id == null || body.default_playlist_id === "" ? null : Number(body.default_playlist_id);
    if (playlistId != null) await assertOwned(supabase, "signage_playlists", playlistId, "No se encontró la lista");
    row.default_playlist_id = playlistId;
  }
  if (!id || body.rotate_token === true) row.playback_token = randomBytes(24).toString("base64url");
  if (!id) row.user_uid = userId;
  const query = id
    ? supabase.from("signage_screens").update(row).eq("id", id).select("id, playback_token").maybeSingle()
    : supabase.from("signage_screens").insert(row).select("id, playback_token").single();
  const { data, error } = await query;
  throwDb(error);
  if (!data) throw new SignageError("No se encontró la pantalla", 404);
  const saved = data as { id: number; playback_token: string };
  return { id: Number(saved.id), playbackToken: saved.playback_token };
}

export async function listSchedules(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("signage_schedules")
    .select("id, screen_id, playlist_id, name, weekdays, start_time, end_time, starts_on, ends_on, priority, is_active")
    .order("priority", { ascending: false });
  throwDb(error);
  const schedules = (data ?? []).map((row) => ({ ...scheduleOf(row as Row), screenId: Number(row.screen_id), name: String(row.name) }));
  const conflicts = schedules.flatMap((left, index) =>
    schedules.slice(index + 1).flatMap((right) =>
      left.screenId === right.screenId && schedulesConflict(left, right)
        ? [{ leftId: left.id, rightId: right.id, leftName: left.name, rightName: right.name }]
        : []
    )
  );
  return { schedules, conflicts };
}

export async function saveSchedule(supabase: SupabaseClient, body: Record<string, unknown>, id?: number) {
  const weekdays = Array.isArray(body.weekdays)
    ? Array.from(new Set(body.weekdays.map(Number))).filter((day) => day >= 0 && day <= 6)
    : [];
  if (weekdays.length === 0) throw new SignageError("Elegí al menos un día");
  const screenId = Number(body.screen_id);
  const playlistId = Number(body.playlist_id);
  if (!Number.isInteger(screenId) || screenId <= 0) throw new SignageError("Elegí una pantalla");
  if (!Number.isInteger(playlistId) || playlistId <= 0) throw new SignageError("Elegí una lista");
  const startsOn = day(body.starts_on);
  const endsOn = day(body.ends_on);
  if (startsOn && endsOn && endsOn < startsOn) throw new SignageError("La vigencia termina antes de empezar");
  await assertOwned(supabase, "signage_screens", screenId, "No se encontró la pantalla");
  await assertOwned(supabase, "signage_playlists", playlistId, "No se encontró la lista");
  const priority = Number(body.priority ?? 0);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new SignageError("La prioridad tiene que estar entre 0 y 100");
  const row = {
    screen_id: screenId,
    playlist_id: playlistId,
    name: text(body.name, "el nombre", 120),
    weekdays,
    start_time: clock(body.start_time, "La hora de inicio"),
    end_time: clock(body.end_time, "La hora de fin"),
    starts_on: startsOn,
    ends_on: endsOn,
    priority,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase.from("signage_schedules").update(row).eq("id", id).select("id").maybeSingle()
    : supabase.from("signage_schedules").insert(row).select("id").single();
  const { data, error } = await query;
  throwDb(error);
  if (!data) throw new SignageError("No se encontró la programación", 404);
  return { id: Number((data as { id: number }).id) };
}

export async function deleteSchedule(supabase: SupabaseClient, id: number) {
  const { error } = await supabase.from("signage_schedules").delete().eq("id", id);
  throwDb(error);
}

export async function setOverride(supabase: SupabaseClient, screenId: number, body: Record<string, unknown>) {
  const playlistId = Number(body.playlist_id);
  if (!Number.isInteger(playlistId) || playlistId <= 0) throw new SignageError("Elegí una lista");
  await assertOwned(supabase, "signage_screens", screenId, "No se encontró la pantalla");
  await assertOwned(supabase, "signage_playlists", playlistId, "No se encontró la lista");
  const minutes = body.minutes == null || body.minutes === "" ? null : Number(body.minutes);
  if (minutes != null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60)) {
    throw new SignageError("La duración manual no es válida");
  }
  const endsAt = minutes == null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
  const { error: deleteError } = await supabase.from("signage_overrides").delete().eq("screen_id", screenId);
  throwDb(deleteError);
  const { error } = await supabase.from("signage_overrides").insert({ screen_id: screenId, playlist_id: playlistId, ends_at: endsAt });
  throwDb(error);
}

export async function clearOverride(supabase: SupabaseClient, screenId: number) {
  const { error } = await supabase.from("signage_overrides").delete().eq("screen_id", screenId);
  throwDb(error);
}

async function loadPlaybackContext(supabase: SupabaseClient) {
  const clubId = await clubIdOf(supabase);
  const service = createServiceClient();
  const club = await loadClubSchedule(service, clubId);
  const { data: playlists, error: playlistError } = await supabase.from("signage_playlists").select("id, name, is_active, transition");
  throwDb(playlistError);
  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("signage_schedules")
    .select("id, screen_id, playlist_id, name, weekdays, start_time, end_time, starts_on, ends_on, priority, is_active");
  throwDb(scheduleError);
  const { data: overrides, error: overrideError } = await supabase.from("signage_overrides").select("screen_id, playlist_id, ends_at");
  throwDb(overrideError);
  const activePlaylistIds = new Set((playlists ?? []).filter((list) => list.is_active).map((list) => Number(list.id)));
  return {
    now: new Date(),
    timeZone: club.timezone,
    schedules: (scheduleRows ?? []).map((row) => ({ ...scheduleOf(row as Row), screenId: Number((row as Row).screen_id) })),
    activePlaylistIds,
    playlistNames: new Map((playlists ?? []).map((list) => [Number(list.id), String(list.name)])),
    transitions: new Map((playlists ?? []).map((list) => [Number(list.id), list.transition === "cut" ? "cut" : "fade"])),
    overrides: new Map((overrides ?? []).map((row) => [Number(row.screen_id), { playlistId: Number(row.playlist_id), endsAt: row.ends_at ? String(row.ends_at) : null }])),
  };
}

async function clubIdOf(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("signage_screens").select("club_id").limit(1);
  if (!error && data && data[0]?.club_id) return Number(data[0].club_id);
  const { data: promo } = await supabase.from("signage_promotions").select("club_id").limit(1);
  if (promo && promo[0]?.club_id) return Number(promo[0].club_id);
  const service = createServiceClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new SignageError("Unauthorized", 401);
  const { clubIdForUser } = await import("@/lib/clubs/actor-club");
  return clubIdForUser(service, userData.user.id);
}

export async function playbackForToken(token: string, knownRevision: string | null) {
  const service = createServiceClient();
  const { data: screen, error } = await service
    .from("signage_screens")
    .select("id, club_id, name, is_active, default_playlist_id, updated_at")
    .eq("playback_token", token)
    .maybeSingle();
  if (error) throwDb(error);
  if (!screen || !screen.is_active) throw new SignageError("No disponible", 404);
  await service.from("signage_screens").update({ last_seen_at: new Date().toISOString() }).eq("id", screen.id);

  const club = await loadClubSchedule(service, Number(screen.club_id));
  const { data: clubRow } = await service.from("clubs").select("short_name, logo_url").eq("id", screen.club_id).maybeSingle();
  const { data: playlists } = await service.from("signage_playlists").select("id, name, is_active, transition, updated_at").eq("club_id", screen.club_id);
  const { data: scheduleRows } = await service
    .from("signage_schedules")
    .select("id, screen_id, playlist_id, name, weekdays, start_time, end_time, starts_on, ends_on, priority, is_active, updated_at")
    .eq("screen_id", screen.id);
  const { data: overrideRow } = await service.from("signage_overrides").select("playlist_id, ends_at").eq("screen_id", screen.id).maybeSingle();
  const activePlaylistIds = new Set((playlists ?? []).filter((list) => list.is_active).map((list) => Number(list.id)));
  const choice = resolvePlayback({
    now: new Date(),
    timeZone: club.timezone,
    schedules: (scheduleRows ?? []).map((row) => scheduleOf(row as Row)),
    defaultPlaylistId: screen.default_playlist_id == null ? null : Number(screen.default_playlist_id),
    override: overrideRow ? { playlistId: Number(overrideRow.playlist_id), endsAt: overrideRow.ends_at ? String(overrideRow.ends_at) : null } : null,
    activePlaylistIds,
  });
  const today = localSignageClock(new Date(), club.timezone).date;
  const { data: allItems } = await service
    .from("signage_playlist_items")
    .select("id, playlist_id, promotion_id, position, duration_seconds")
    .eq("club_id", screen.club_id)
    .order("position");
  const promotionIds = Array.from(new Set((allItems ?? []).map((item) => Number(item.promotion_id))));
  const { data: promos } = promotionIds.length
    ? await service
        .from("signage_promotions")
        .select("id, name, title, description, image_url, price, highlight, starts_on, ends_on, is_active, content_type, updated_at")
        .in("id", promotionIds)
    : { data: [] };
  const byId = new Map((promos ?? []).map((promo) => [Number(promo.id), promoOf(promo as Row)]));
  const slidesFor = (playlistId: number | null) => (allItems ?? []).flatMap((item) => {
    if (Number(item.playlist_id) !== playlistId) return [];
    const promo = byId.get(Number(item.promotion_id));
    if (!promo || !promotionIsLive({ isActive: promo.isActive, startsOn: promo.startsOn, endsOn: promo.endsOn }, today)) return [];
    return [{
      id: Number(item.id),
      durationSeconds: Number(item.duration_seconds),
      contentType: promo.contentType,
      title: promo.title,
      description: promo.description,
      imageUrl: promo.imageUrl,
      price: promo.price,
      highlight: promo.highlight,
    }];
  });
  let items = slidesFor(choice.playlistId);
  const defaultId = screen.default_playlist_id == null ? null : Number(screen.default_playlist_id);
  if (items.length === 0 && choice.source !== "default" && defaultId != null && activePlaylistIds.has(defaultId)) {
    choice.source = "default";
    choice.playlistId = defaultId;
    choice.scheduleId = null;
    items = slidesFor(defaultId);
  }
  const playlist = (playlists ?? []).find((list) => Number(list.id) === choice.playlistId);
  const revision = createHash("sha1")
    .update(JSON.stringify({ choice, items, playlistUpdated: playlist?.updated_at ?? null }))
    .digest("hex")
    .slice(0, 16);
  if (knownRevision && knownRevision === revision) {
    return { revision, unchanged: true as const };
  }
  return {
    revision,
    unchanged: false as const,
    screenName: String(screen.name),
    source: items.length ? choice.source : "fallback",
    playlistName: playlist ? String(playlist.name) : null,
    transition: playlist?.transition === "cut" ? "cut" : "fade",
    items,
    fallback: {
      name: String(clubRow?.short_name || "PCP"),
      logoUrl: clubRow?.logo_url ? String(clubRow.logo_url) : null,
    },
  };
}
