export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/models/db/category";

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
    const type = url.searchParams.get("type"); // 'libre' | 'damas' | omit = all

    let query = supabase
      .from("categories")
      .select("id, name, type, display_order")
      .order("display_order", { ascending: true });

    if (type === "libre" || type === "damas") {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /categories error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch categories" },
        { status: 500 }
      );
    }

    return NextResponse.json((data ?? []) as Category[]);
  } catch (err) {
    console.error("GET /categories error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
