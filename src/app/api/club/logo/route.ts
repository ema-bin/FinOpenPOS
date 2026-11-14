export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseStorageService } from "@/services/supabase-storage.service";

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Elegí una imagen" }, { status: 400 });
    }
    const url = await supabaseStorageService.uploadClubLogo(file);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("POST /api/club/logo error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir el logo" },
      { status: 500 }
    );
  }
}
