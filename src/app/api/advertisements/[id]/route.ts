export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: { id: string } };

async function ensureAuth() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return { supabase, user };
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { supabase } = await ensureAuth();
    const advertisementId = Number(params.id);

    if (Number.isNaN(advertisementId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data, error } = await supabase
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
      .eq("id", advertisementId)
      .single();

    if (error) {
      console.error("GET /advertisements/:id error:", error);
      return NextResponse.json({ error: "Advertisement not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /advertisements/:id error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { supabase } = await ensureAuth();
    const advertisementId = Number(params.id);

    if (Number.isNaN(advertisementId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.image_url === "string") updates.image_url = body.image_url.trim();
    if (typeof body.target_url === "string")
      updates.target_url = body.target_url.trim() || null;
    if (typeof body.description === "string")
      updates.description = body.description.trim() || null;
    if (typeof body.ordering === "number") updates.ordering = body.ordering;
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No data to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("advertisements")
      .update(updates)
      .eq("id", advertisementId)
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
      console.error("PATCH /advertisements/:id error:", error);
      return NextResponse.json(
        { error: "Failed to update advertisement" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /advertisements/:id error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { supabase } = await ensureAuth();
    const advertisementId = Number(params.id);

    if (Number.isNaN(advertisementId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("advertisements")
      .update({ is_active: false })
      .eq("id", advertisementId);

    if (error) {
      console.error("DELETE /advertisements/:id error:", error);
      return NextResponse.json(
        { error: "Failed to deactivate advertisement" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /advertisements/:id error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
