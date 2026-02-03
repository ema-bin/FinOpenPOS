import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

class SupabaseStorageService {
  private client = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
