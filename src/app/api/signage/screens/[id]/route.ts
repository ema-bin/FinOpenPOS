export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-origin";
import { saveScreen } from "@/lib/signage/data";
import { signageContext, signageHttpError } from "@/lib/signage/guard";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await request.json();
    const saved = await saveScreen(ctx.supabase, ctx.userId, body, Number(params.id));
    return NextResponse.json({
      ...saved,
      playbackUrl: `${getAppOrigin(request)}/tv/${saved.playbackToken}`,
    });
  } catch (error) {
    return signageHttpError(error);
  }
}
