export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clubIdForUser } from "@/lib/clubs/actor-club";

const FALLBACK = "/PCP-logo.png";

async function logoUrlForRequest(): Promise<string | null> {
  const service = createServiceClient();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      const clubId = await clubIdForUser(service, user.id);
      const { data } = await service.from("clubs").select("logo_url").eq("id", clubId).maybeSingle();
      return data?.logo_url ? String(data.logo_url) : null;
    } catch {
      return null;
    }
  }

  const { data } = await service.from("clubs").select("logo_url").order("id").limit(2);
  if (data?.length === 1 && data[0].logo_url) return String(data[0].logo_url);
  return null;
}

export async function GET(request: Request) {
  const fallback = NextResponse.redirect(new URL(FALLBACK, request.url));
  try {
    const logoUrl = await logoUrlForRequest();
    if (!logoUrl) return fallback;
    const upstream = await fetch(logoUrl);
    if (!upstream.ok) return fallback;
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/png",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return fallback;
  }
}
