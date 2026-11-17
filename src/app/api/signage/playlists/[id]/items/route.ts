export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { replaceItems } from "@/lib/signage/data";
import { signageContext, signageHttpError } from "@/lib/signage/guard";

type Params = { params: { id: string } };

export async function PUT(request: Request, { params }: Params) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    await replaceItems(ctx.supabase, Number(params.id), items);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return signageHttpError(error);
  }
}
