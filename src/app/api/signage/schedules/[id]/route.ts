export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { deleteSchedule, saveSchedule } from "@/lib/signage/data";
import { signageContext, signageHttpError } from "@/lib/signage/guard";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await request.json();
    return NextResponse.json(await saveSchedule(ctx.supabase, body, Number(params.id)));
  } catch (error) {
    return signageHttpError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await signageContext("write");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteSchedule(ctx.supabase, Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return signageHttpError(error);
  }
}
