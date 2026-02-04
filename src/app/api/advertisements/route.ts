export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_VALUES = ["active", "inactive", "all"] as const;

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "active";
    const status = STATUS_VALUES.includes(statusParam as (typeof STATUS_VALUES)[number])
      ? (statusParam as (typeof STATUS_VALUES)[number])
      : "active";

    let query = supabase
      .from("advertisements")
      .select(
        `
          id,
          name,
          image_url,
          target_url,
          description,
          is_active,
          ordering,
          created_at
        `
      )
      .order("ordering", { ascending: true });

    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /advertisements error:", error);
      return NextResponse.json(
        { error: error.message || "No se pudieron cargar las publicidades" },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("GET /advertisements error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const imageUrl = String(body.image_url ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("advertisements")
      .insert({
        user_uid: user.id,
        name,
        image_url: imageUrl,
        target_url: body.target_url ?? null,
        description: body.description ?? null,
        ordering: body.ordering ?? 0,
        is_active: body.is_active ?? true,
      })
      .select(
        `
          id,
          name,
          image_url,
          target_url,
          description,
          is_active,
          ordering,
          created_at
        `
      )
      .single();

    if (error) {
      console.error("POST /advertisements error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create advertisement" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("POST /advertisements error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
