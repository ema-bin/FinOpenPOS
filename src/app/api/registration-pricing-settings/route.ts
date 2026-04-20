export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchRegistrationPricingSettings,
  type RegistrationPricingSettings,
} from "@/lib/registration-pricing";

export async function GET() {
  try {
    const supabase = createClient();
    const settings = await fetchRegistrationPricingSettings(supabase);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("GET registration-pricing-settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<RegistrationPricingSettings>;

    const pct = body.puntuable_lower_category_discount_percent;

    if (pct === undefined) {
      return NextResponse.json({ error: "puntuable_lower_category_discount_percent es requerido" }, { status: 400 });
    }

    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json(
        { error: "puntuable_lower_category_discount_percent debe estar entre 0 y 100" },
        { status: 400 }
      );
    }

    const row = {
      id: 1,
      puntuable_lower_category_discount_percent: n,
    };

    const { error } = await supabase.from("registration_pricing_settings").upsert(row, {
      onConflict: "id",
    });

    if (error) {
      console.error("PATCH registration_pricing_settings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const settings = await fetchRegistrationPricingSettings(supabase);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("PATCH registration-pricing-settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
