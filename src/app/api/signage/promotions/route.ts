export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listPromotions, savePromotion } from "@/lib/signage/data";
import { signageContext, signageHttpError } from "@/lib/signage/guard";

export async function GET() {
  const ctx = await signageContext("read");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await listPromotions(ctx.supabase));
  } catch (error) {
    return signageHttpError(error);
  }
}

export async function POST(request: Request) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await request.json();
    return NextResponse.json(await savePromotion(ctx.supabase, ctx.userId, body), { status: 201 });
  } catch (error) {
    return signageHttpError(error);
  }
}
