export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/require-permission";
import { parseTemporaryPassword } from "@/lib/auth/create-user-input";

type RouteParams = { params: { id: string } };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) return auth.response;

    const parsed = parseTemporaryPassword(
      ((await request.json().catch(() => null)) as { password?: unknown } | null)?.password
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const service = createServiceClient();
    const { error } = await service.auth.admin.updateUserById(params.id, {
      password: parsed.password,
    });

    if (error) {
      const status = /not found/i.test(error.message) ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ userId: params.id });
  } catch (error) {
    console.error("POST /api/users/[id]/password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
