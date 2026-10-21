export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { idParam, withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  return withClasses("PATCH /classes/charges/[id]", async (repos) => {
    const body = await request.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount)) throw new ClassRequestError("El monto no es válido");
    const rawMethod = body.paymentMethodId ?? body.payment_method_id;
    if (rawMethod != null && rawMethod !== "") {
      const paymentMethodId = Number(rawMethod);
      if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
        throw new ClassRequestError("Elegí dónde se pagó");
      }
      const charge = await repos.classes.updatePayment(idParam(params.id), amount, paymentMethodId);
      return NextResponse.json(charge);
    }
    const charge = await repos.classes.updateChargeAmount(idParam(params.id), amount);
    return NextResponse.json(charge);
  });
}
