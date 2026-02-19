export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseStorageService } from "@/services/supabase-storage.service";

type RouteParams = { params: { id: string } };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const matchId = Number(params.id);
    if (Number.isNaN(matchId)) {
      return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
    }

    const { data: match, error: matchError } = await supabase
      .from("tournament_matches")
      .select("id, tournament_id")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const url = await supabaseStorageService.uploadMatchPhoto(
      file,
      match.tournament_id
    );

    const { error: updateError } = await supabase
      .from("tournament_matches")
      .update({ photo_url: url })
      .eq("id", matchId);

    if (updateError) {
      console.error("Error saving photo_url to match:", updateError);
      return NextResponse.json(
        { error: "Error al guardar la URL de la foto en el partido" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Match photo upload error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
