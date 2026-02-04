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
}

export const supabaseStorageService = new SupabaseStorageService();
