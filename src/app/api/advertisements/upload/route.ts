export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const supabase = createClient();
    const fileExt = file.name.split(".").pop() || "png";
    const key = `advertisements/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    const { data, error: uploadError } = await supabase.storage
      .from("advertisements")
      .upload(key, file, { cacheControl: "3600" });

    if (uploadError || !data) {
      console.error("Upload error", uploadError);
      return NextResponse.json(
        { error: uploadError?.message || "Upload failed" },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage
      .from("advertisements")
      .getPublicUrl(data.path);

    return NextResponse.json({ url: publicData.publicUrl });
  } catch (error) {
    console.error("Upload error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
