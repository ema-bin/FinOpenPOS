export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { clubIdForUser } from "@/lib/clubs/actor-club";
import { signageContext, signageHttpError } from "@/lib/signage/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { supabaseStorageService } from "@/services/supabase-storage.service";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Elegí una imagen" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "La imagen tiene que ser PNG, JPG o WebP" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "La imagen no puede pasar de 8 MB" }, { status: 400 });
    }
    const clubId = await clubIdForUser(createServiceClient(), ctx.userId);
    const url = await supabaseStorageService.uploadSignageImage(file, clubId);
    return NextResponse.json({ url });
  } catch (error) {
    return signageHttpError(error);
  }
}
