export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  batchComputePlayerRegistrationPricing,
  fetchRegistrationPricingSettings,
} from "@/lib/registration-pricing";

type RouteParams = { params: { id: string } };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const tournamentId = Number(params.id);

    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("registration_fee")
      .eq("id", tournamentId)
      .single();

    if (tournamentError) {
      console.error("Error fetching tournament:", tournamentError);
    }

    const { data: teams, error: teamsError } = await supabase
      .from("tournament_teams")
      .select(`
        id,
        display_name,
        display_order,
        player1_id,
        player2_id,
        player1:players!player1_id (
          id,
          first_name,
          last_name,
          category_id,
          female_category_id
        ),
        player2:players!player2_id (
          id,
          first_name,
          last_name,
          category_id,
          female_category_id
        )
      `)
      .eq("tournament_id", tournamentId)
      .eq("is_substitute", false)
      .order("display_order", { ascending: true });

    if (teamsError) {
      console.error("Error fetching teams:", teamsError);
      return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
    }

    const { data: payments, error: paymentsError } = await supabase
      .from("tournament_registration_payments")
      .select(
        `
        *,
        payment_method:payment_methods!payment_method_id (
          id,
          name
        )
      `
      )
      .eq("tournament_id", tournamentId);

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
      return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
    }

    const paymentsMap = new Map<string, Record<string, unknown>>();
    (payments || []).forEach((p: Record<string, unknown>) => {
      const key = `${p.tournament_team_id}_${p.player_id}`;
      paymentsMap.set(key, p);
    });

    const playerIds: number[] = [];
    (teams || []).forEach((team: Record<string, unknown>) => {
      if (team.player1_id) playerIds.push(team.player1_id as number);
      if (team.player2_id) playerIds.push(team.player2_id as number);
    });

    const pricingByPlayer = await batchComputePlayerRegistrationPricing(
      supabase,
      tournamentId,
      playerIds
    );

    let pricingSettings;
    try {
      pricingSettings = await fetchRegistrationPricingSettings(supabase);
    } catch {
      pricingSettings = {
        puntuable_lower_category_discount_percent: 20,
      };
    }

    const formattedPayments: Record<string, unknown>[] = [];

    (teams || []).forEach((team: Record<string, unknown>) => {
      const pushPlayer = (playerId: number | null | undefined, slot: "p1" | "p2") => {
        if (!playerId) return;
        const key = `${team.id}_${playerId}`;
        const payment = paymentsMap.get(key) as Record<string, unknown> | undefined;
        const pricing = pricingByPlayer.get(playerId);

        const player =
          slot === "p1" ? team.player1 : team.player2;

        formattedPayments.push({
          id: payment?.id ?? null,
          tournament_id: tournamentId,
          tournament_team_id: team.id,
          player_id: playerId,
          has_paid: payment?.has_paid || false,
          is_registration_free: Boolean(payment?.is_registration_free),
          payment_method_id: payment?.payment_method_id || null,
          payment_method: Array.isArray(payment?.payment_method)
            ? (payment.payment_method[0] || null)
            : payment?.payment_method || null,
          notes: payment?.notes || null,
          created_at: payment?.created_at || null,
          updated_at: payment?.updated_at || null,
          player,
          team: {
            id: team.id,
            display_name: team.display_name,
            display_order: team.display_order,
          },
          amount_due:
            pricing?.amount_due ?? (Number(tournament?.registration_fee) || 0),
          pricing_reason: pricing?.pricing_reason ?? null,
        });
      };

      pushPlayer(team.player1_id as number | undefined, "p1");
      pushPlayer(team.player2_id as number | undefined, "p2");
    });

    return NextResponse.json({
      payments: formattedPayments,
      registration_fee: tournament?.registration_fee || 0,
      pricing_settings: pricingSettings,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /tournaments/:id/payments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentId = Number(params.id);

    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const {
      tournament_team_id,
      player_id,
      has_paid,
      is_registration_free,
      payment_method_id,
      notes,
    } = body;

    if (!tournament_team_id || !player_id) {
      return NextResponse.json(
        { error: "tournament_team_id and player_id are required" },
        { status: 400 }
      );
    }

    const { data: team, error: teamError } = await supabase
      .from("tournament_teams")
      .select("id, is_substitute, player1_id, player2_id")
      .eq("id", tournament_team_id)
      .eq("tournament_id", tournamentId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.is_substitute) {
      return NextResponse.json(
        { error: "Cannot register payment for substitute teams" },
        { status: 400 }
      );
    }

    if (team.player1_id !== player_id && team.player2_id !== player_id) {
      return NextResponse.json({ error: "Player does not belong to this team" }, { status: 400 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from("tournament_registration_payments")
      .upsert(
        {
          tournament_id: tournamentId,
          tournament_team_id,
          player_id,
          user_uid: user.id,
          has_paid: has_paid ?? false,
          is_registration_free: Boolean(is_registration_free),
          payment_method_id: payment_method_id || null,
          notes: notes || null,
        },
        {
          onConflict: "tournament_team_id,player_id",
        }
      )
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating/updating payment:", paymentError);
      return NextResponse.json({ error: "Failed to save payment" }, { status: 500 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("POST /tournaments/:id/payments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentId = Number(params.id);

    if (Number.isNaN(tournamentId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { payment_id, has_paid, is_registration_free, payment_method_id, notes } = body;

    if (!payment_id) {
      return NextResponse.json({ error: "payment_id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (has_paid !== undefined) updates.has_paid = has_paid;
    if (is_registration_free !== undefined) updates.is_registration_free = Boolean(is_registration_free);
    if (payment_method_id !== undefined) updates.payment_method_id = payment_method_id;
    if (notes !== undefined) updates.notes = notes;

    const { data: payment, error: paymentError } = await supabase
      .from("tournament_registration_payments")
      .update(updates)
      .eq("id", payment_id)
      .eq("tournament_id", tournamentId)
      .select()
      .single();

    if (paymentError) {
      console.error("Error updating payment:", paymentError);
      return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("PATCH /tournaments/:id/payments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
