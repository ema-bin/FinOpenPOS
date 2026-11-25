export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { loadCourtOccupancy } from "@/lib/court-occupancy-load";
import { createRepositories } from "@/lib/repository-factory";
import { createServiceClient } from "@/lib/supabase/service";
import { buildCourtDayBalance } from "@/lib/court-balance";
import { methodConsumesCredit } from "@/lib/slot-credits";
import type { CourtSlotWithCourt } from "@/models/db/court";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function seat(method: CourtSlotWithCourt["player1_payment_method"]) {
  return {
    paymentMethodId: method?.id ?? null,
    paymentMethodName: method?.name ?? null,
    consumesCredit: methodConsumesCredit(method),
  };
}

function seatsOf(slot: CourtSlotWithCourt) {
  return [
    seat(slot.player1_payment_method),
    seat(slot.player2_payment_method),
    seat(slot.player3_payment_method),
    seat(slot.player4_payment_method),
  ];
}

export async function GET(request: Request) {
  const auth = await requirePermission("finance.manage", "read");
  if (!auth.ok) return auth.response;

  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!DATE.test(date)) {
    return NextResponse.json({ error: "La fecha no es válida." }, { status: 400 });
  }

  try {
    const repos = await createRepositories();
    const [slots, tariffs, packs] = await Promise.all([
      repos.courtSlots.findByDate(date),
      repos.courtPricing.findCovering(date),
      repos.slotCredits.listSales(date, date),
    ]);

    const balance = buildCourtDayBalance({
        date,
        slots: slots.map((slot) => ({
          id: slot.id,
          courtId: slot.court?.id ?? slot.court_id ?? null,
          courtName: slot.court?.name ?? "Sin cancha",
          startTime: slot.start_time,
          endTime: slot.end_time,
          wasPlayed: Boolean(slot.was_played),
          seats: seatsOf(slot),
        })),
        tariffs: tariffs.map((row) => ({
          courtId: row.court_id,
          startTime: row.start_time,
          endTime: row.end_time,
          pricePerPlayer: row.price_per_player,
          validFrom: row.valid_from ?? "1970-01-01",
          validUntil: row.valid_until ?? null,
        })),
        packs: packs.map((pack) => ({
          id: pack.id,
          paymentMethodId: pack.payment_method_id,
          paymentMethodName: pack.payment_method_name,
          amountPaid: pack.amount_paid,
          playerName: `${pack.first_name} ${pack.last_name}`.trim(),
          packName: pack.name,
        })),
      });
    let occupancy = null;
    try {
      const service = createServiceClient();
      const clubId = await clubIdForUser(service, auth.userId);
      occupancy = await loadCourtOccupancy(service, clubId, [date]);
    } catch (error) {
      if (error instanceof ClubContextError) throw error;
      console.error("GET /court-balance occupancy:", error);
    }
    return NextResponse.json({ ...balance, occupancy });
  } catch (error) {
    console.error("GET /court-balance error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
