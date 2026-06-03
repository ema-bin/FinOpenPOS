import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

class SupabaseStorageService {
  private _client: SupabaseClient | null = null;

  private get client(): SupabaseClient {
    if (!this._client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      }
      this._client = createSupabaseClient(url, key);
    }
    return this._client;
  }

  async uploadAdvertisementImage(file: File): Promise<string> {
    const ext = file.name.split(".").pop() ?? "png";
    const key = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { data, error } = await this.client.storage
      .from("advertisements")
      .upload(key, file, { cacheControl: "3600" });

    if (error || !data) {
      throw error ?? new Error("Upload failed");
    }

    const { data: publicData } = this.client.storage
      .from("advertisements")
      .getPublicUrl(data.path);

    return publicData.publicUrl;
  }

  /**
   * Sube una foto de partido al bucket tournament_matches dentro de la carpeta del torneo.
   * Ruta final: tournament_matches / {tournamentId} / {timestamp}-{uuid}.{ext}
   * La carpeta del torneo (tournamentId) se crea automáticamente al subir el primer archivo con ese path.
   */
  async uploadMatchPhoto(file: File, tournamentId: number): Promise<string> {
    const ext = file.name.split(".").pop() ?? "jpg";
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const path = `${tournamentId}/${filename}`;

    const { data, error } = await this.client.storage
      .from("tournament_matches")
      .upload(path, file, { cacheControl: "3600" });

    if (error || !data) {
      throw error ?? new Error("Upload failed");
    }

    const { data: publicData } = this.client.storage
      .from("tournament_matches")
      .getPublicUrl(data.path);

    return publicData.publicUrl;
  }

  /**
   * Flier de promoción del torneo. Ruta: tournament_promo_flyers / {tournamentId} / {timestamp}-{uuid}.{ext}
   * Archivo nuevo en cada subida (evita caché del navegador/CDN al reemplazar).
   */
  async uploadTournamentPromoFlyer(
    file: File,
    tournamentId: number
  ): Promise<string> {
    const rawExt = (file.name.split(".").pop() ?? "png").toLowerCase();
    const ext = ["png", "jpg", "jpeg", "webp"].includes(rawExt) ? rawExt : "png";
    const folder = String(tournamentId);

    const { data: existing } = await this.client.storage
      .from("tournament_promo_flyers")
      .list(folder);
    if (existing?.length) {
      const toRemove = existing.map((o) => `${folder}/${o.name}`);
      await this.client.storage.from("tournament_promo_flyers").remove(toRemove);
    }

    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const path = `${folder}/${filename}`;

    const { data, error } = await this.client.storage
      .from("tournament_promo_flyers")
      .upload(path, file, { cacheControl: "300" });

    if (error || !data) {
      throw error ?? new Error("Upload failed");
    }

    const { data: publicData } = this.client.storage
      .from("tournament_promo_flyers")
      .getPublicUrl(data.path);

    return publicData.publicUrl;
  }

  /** Elimina todos los fliers guardados de un torneo. */
  async removeTournamentPromoFlyers(tournamentId: number): Promise<void> {
    const folder = String(tournamentId);
    const { data: existing } = await this.client.storage
      .from("tournament_promo_flyers")
      .list(folder);
    if (!existing?.length) return;
    const paths = existing.map((o) => `${folder}/${o.name}`);
    await this.client.storage.from("tournament_promo_flyers").remove(paths);
  }
}

export const supabaseStorageService = new SupabaseStorageService();
