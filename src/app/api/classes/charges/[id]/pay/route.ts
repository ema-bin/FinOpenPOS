export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  return withClasses("POST /classes/charges/[id]/pay", async (repos) => {
    const body = await request.json().catch(() => ({}));
    const raw = body.paymentMethodId ?? body.payment_method_id;
    const paymentMethodId = raw == null || raw === "" ? undefined : Number(raw);
    if (paymentMethodId !== undefined && (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0)) {
      throw new ClassRequestError("Elegí el medio de pago");
    }
    const charge = await repos.classes.payCharge(idParam(params.id), paymentMethodId);
    return NextResponse.json(charge);
  });
}
