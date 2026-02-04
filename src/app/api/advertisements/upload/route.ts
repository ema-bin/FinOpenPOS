export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { supabaseStorageService } from "@/services/supabase-storage.service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const url = await supabaseStorageService.uploadAdvertisementImage(file);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Upload error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
