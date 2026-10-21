export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { withClasses } from "@/lib/class-route";
import { ClassRequestError } from "@/lib/class-request-error";

export async function GET() {
  return withClasses("GET /classes/professors", async (repos) => {
    const result = await repos.classes.listProfessors();
    return NextResponse.json(result);
  });
}

export async function POST(request: Request) {
  return withClasses("POST /classes/professors", async (repos) => {
    const body = await request.json();
    const paymentMethodId = Number(body.paymentMethodId ?? body.payment_method_id);
    if (!Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
      throw new ClassRequestError("Elegí el medio de pago del profesor");
    }
    const professor = await repos.classes.createProfessor({
      name: String(body.name ?? ""),
      phone: body.phone ?? null,
      paymentMethodId,
    });
    return NextResponse.json(professor, { status: 201 });
  });
}
