import { describe, expect, it } from "vitest";
import { promotionStorageKey } from "@/services/supabase-storage.service";

describe("carpeta de promociones", () => {
  it("apunta a promotions aunque la URL guardada sea la carpeta anterior", () => {
    expect(promotionStorageKey(
      "https://ejemplo.supabase.co/storage/v1/object/public/advertisements/signage/4/foto.jpg"
    )).toBe("promotions/4/foto.jpg");
    expect(promotionStorageKey(
      "https://ejemplo.supabase.co/storage/v1/object/public/digital_signage/promotions/4/foto.jpg"
    )).toBe("promotions/4/foto.jpg");
  });

  it("deja en paz una imagen que no está en Storage", () => {
    expect(promotionStorageKey("https://cdn.ejemplo.com/foto.jpg")).toBeNull();
  });
});
