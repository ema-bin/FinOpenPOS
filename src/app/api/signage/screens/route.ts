export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-origin";
import { listScreens, saveScreen } from "@/lib/signage/data";
import { signageContext, signageHttpError } from "@/lib/signage/guard";

export async function GET(request: Request) {
  const ctx = await signageContext("read");
  if (!ctx.ok) return ctx.response;
  try {
    const origin = getAppOrigin(request);
    const screens = await listScreens(ctx.supabase);
    return NextResponse.json(screens.map((screen) => ({
      ...screen,
      playbackUrl: `${origin}/tv/${screen.playbackToken}`,
    })));
  } catch (error) {
    return signageHttpError(error);
  }
}

export async function POST(request: Request) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await request.json();
    const saved = await saveScreen(ctx.supabase, ctx.userId, body);
    return NextResponse.json({
      ...saved,
      playbackUrl: `${getAppOrigin(request)}/tv/${saved.playbackToken}`,
    }, { status: 201 });
  } catch (error) {
    return signageHttpError(error);
  }
}
