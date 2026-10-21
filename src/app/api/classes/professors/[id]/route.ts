export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  return withClasses("PATCH /classes/professors/[id]", async (repos) => {
    const body = await request.json();
    await repos.classes.updateProfessor(idParam(params.id), {
      name: body.name !== undefined ? String(body.name) : undefined,
      phone: body.phone !== undefined ? body.phone : undefined,
      paymentMethodId:
        body.paymentMethodId !== undefined || body.payment_method_id !== undefined
          ? Number(body.paymentMethodId ?? body.payment_method_id)
          : undefined,
      paymentAccount:
        body.paymentAccount !== undefined || body.payment_account !== undefined
          ? body.paymentAccount ?? body.payment_account
          : undefined,
      isActive:
        body.isActive !== undefined || body.is_active !== undefined
          ? Boolean(body.isActive ?? body.is_active)
          : undefined,
    });
    return NextResponse.json({ ok: true });
  });
}
