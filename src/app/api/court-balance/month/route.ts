export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { loadClubSchedule } from "@/lib/clubs/load-club";
import { businessDayRange, courtDayClock, currentBusinessDate } from "@/lib/clubs/schedule";
import { monthBounds } from "@/lib/class-time";
import { createRepositories } from "@/lib/repository-factory";
import { createServiceClient } from "@/lib/supabase/service";
import { buildCourtDayBalance, courtTariffCents } from "@/lib/court-balance";
import { loadCourtOccupancy } from "@/lib/court-occupancy-load";
import { isCourtPaymentScope } from "@/lib/finance/payment-credentials";
import {
  chargeFromSeat,
  chargeKey,
  monthExpenses,
  reconcileMonth,
  type ExpectedCharge,
  type SettlementMarkInput,
  type SettlementMovement,
} from "@/lib/finance/settlement-match";
import { methodConsumesCredit } from "@/lib/slot-credits";
import type { CourtSlotWithCourt } from "@/models/db/court";

const ROWS_SCRIPT = "scripts/add-mp-settlement-rows.sql";
const MATCH_SCRIPT = "scripts/add-mp-settlement-matches.sql";
const FLAG_SCRIPT = "scripts/add-payment-method-mercadopago.sql";

function missingTable(error: { code?: string; message?: string } | null, name: string): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || (error.message ?? "").includes(name);
}

function pesosToCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function clock(value: string): string {
  return value.slice(0, 5);
}

function failure(error: unknown) {
  if (error instanceof ClubContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.manage", "read");
    if (!auth.ok) return auth.response;
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const bounds = monthBounds(month);
    if (!bounds) return NextResponse.json({ error: "El mes no es válido." }, { status: 400 });

    const service = createServiceClient();
    const clubId = await clubIdForUser(service, auth.userId);
    const club = await loadClubSchedule(service, clubId);
    const methods = await service
      .from("payment_methods")
      .select("id, name, scope, is_mercadopago")
      .eq("club_id", clubId)
      .eq("is_mercadopago", true);
    if (methods.error && (methods.error.code === "42703" || /is_mercadopago/i.test(methods.error.message ?? ""))) {
      return NextResponse.json({ error: `Falta aplicar ${FLAG_SCRIPT}` }, { status: 503 });
    }
    if (methods.error) return NextResponse.json({ error: methods.error.message }, { status: 500 });
    const courtMethods = (methods.data ?? [])
      .filter((method) => isCourtPaymentScope(String(method.scope)))
      .map((method) => ({ id: Number(method.id), name: String(method.name ?? "Medio") }));
    const paymentMethodIds = courtMethods.map((method) => method.id);

    const repos = await createRepositories();
    const dates = Array.from({ length: Number(bounds.end.slice(8, 10)) }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `${month}-${day}`;
    });
    const [slots, tariffs, packs] = await Promise.all([
      repos.courtSlots.findByDate(bounds.start, bounds.end),
      repos.courtPricing.findCoveringRange(bounds.start, bounds.end),
      repos.slotCredits.listSales(bounds.start, bounds.end),
    ]);
    const tariffRows = tariffs.map((row) => ({
      courtId: row.court_id,
      startTime: row.start_time,
      endTime: row.end_time,
      pricePerPlayer: row.price_per_player,
      validFrom: row.valid_from ?? "1970-01-01",
      validUntil: row.valid_until ?? null,
    }));

    let slotRevenueCents = 0;
    let packRevenueCents = 0;
    const charges: Array<ExpectedCharge & { date: string }> = [];
    for (const date of dates) {
      const daySlots = slots.filter((slot) => slot.slot_date === date);
      const dayPacks = packs.filter((pack) => pack.sold_at.slice(0, 10) === date);
      const balance = buildCourtDayBalance({
        date,
        slots: daySlots.map((slot) => ({
          id: slot.id,
          courtId: slot.court?.id ?? slot.court_id ?? null,
          courtName: slot.court?.name ?? "Sin cancha",
          startTime: slot.start_time,
          endTime: slot.end_time,
          wasPlayed: Boolean(slot.was_played),
          seats: [
            seatOf(slot.player1_payment_method),
            seatOf(slot.player2_payment_method),
            seatOf(slot.player3_payment_method),
            seatOf(slot.player4_payment_method),
          ],
        })),
        tariffs: tariffRows,
        packs: dayPacks.map((pack) => ({
          id: pack.id,
          paymentMethodId: pack.payment_method_id,
          paymentMethodName: pack.payment_method_name,
          amountPaid: pack.amount_paid,
          playerName: `${pack.first_name} ${pack.last_name}`.trim(),
          packName: pack.name,
        })),
      });
      slotRevenueCents += balance.slotRevenueCents;
      packRevenueCents += balance.packRevenueCents;

      daySlots.forEach((slot) => {
        if (!slot.was_played) return;
        const seats: Array<[number, CourtSlotWithCourt["player1_payment_method"]]> = [
          [1, slot.player1_payment_method],
          [2, slot.player2_payment_method],
          [3, slot.player3_payment_method],
          [4, slot.player4_payment_method],
        ];
        for (const [seatIndex, method] of seats) {
          if (!method || !paymentMethodIds.includes(method.id)) continue;
          const amountCents = courtTariffCents(
            tariffRows,
            slot.court?.id ?? slot.court_id ?? null,
            slot.start_time,
            date,
          );
          const charge = chargeFromSeat({
            paymentMethodId: method.id,
            consumesCredit: methodConsumesCredit(method),
            amountCents,
            courtSlotId: slot.id,
            seatIndex,
            label: `${slot.court?.name ?? "Sin cancha"} ${clock(slot.start_time)}`,
          });
          if (charge === "skip" || charge === "missing") continue;
          charges.push({ ...charge, date });
        }
      });
      for (const pack of dayPacks) {
        if (pack.payment_method_id == null || !paymentMethodIds.includes(pack.payment_method_id)) continue;
        const amountCents = pesosToCents(pack.amount_paid);
        if (amountCents == null) continue;
        charges.push({
          key: chargeKey({ kind: "pack", courtSlotId: null, seatIndex: null, packId: pack.id }),
          kind: "pack",
          paymentMethodId: pack.payment_method_id,
          amountCents,
          courtSlotId: null,
          seatIndex: null,
          packId: pack.id,
          label: pack.name,
          date,
        });
      }
    }

    const rows = await monthRows(service, clubId, club.timezone, paymentMethodIds, bounds.start, bounds.end);
    if ("error" in rows) return rows.error;
    const reconciled = reconcileMonth({
      dates,
      paymentMethodIds,
      charges,
      rows: rows.movements,
      marks: rows.marks,
    });
    const expectedCents = reconciled.days.reduce((total, day) => total + day.expectedCents, 0);
    const collectedCents = reconciled.days.reduce((total, day) => total + day.collectedCents, 0);
    const names = new Map(courtMethods.map((method) => [method.id, method.name]));
    let occupancy = null;
    try {
      occupancy = await loadCourtOccupancy(service, clubId, dates);
    } catch (error) {
      console.error("GET /court-balance/month occupancy:", error);
    }

    return NextResponse.json({
      month,
      balance: {
        slotRevenueCents,
        packRevenueCents,
        totalRevenueCents: slotRevenueCents + packRevenueCents,
      },
      expectedCents,
      collectedCents,
      methods: reconciled.methods
        .map((method) => ({
          paymentMethodId: method.paymentMethodId,
          paymentMethodName: names.get(method.paymentMethodId) ?? "Medio",
          expectedCents: method.expectedCents,
          collectedCents: method.collectedCents,
        }))
        .sort((a, b) => a.paymentMethodName.localeCompare(b.paymentMethodName, "es")),
      days: reconciled.days,
      timezone: club.timezone,
      expenses: monthExpenses(rows.movements).map((expense) => ({
        ...expense,
        paymentMethodName: names.get(expense.paymentMethodId) ?? "Medio",
      })),
      occupancy,
    });
  } catch (error) {
    return failure(error);
  }
}

function seatOf(method: CourtSlotWithCourt["player1_payment_method"]) {
  return {
    paymentMethodId: method?.id ?? null,
    paymentMethodName: method?.name ?? null,
    consumesCredit: methodConsumesCredit(method),
  };
}

async function monthRows(
  service: ReturnType<typeof createServiceClient>,
  clubId: number,
  timeZone: string,
  paymentMethodIds: number[],
  startDate: string,
  endDate: string,
): Promise<{ movements: Array<SettlementMovement & { date: string }>; marks: SettlementMarkInput[] } | { error: NextResponse }> {
  if (paymentMethodIds.length === 0) return { movements: [], marks: [] };
  const probe = await service.from("mp_settlement_matches").select("id").eq("club_id", clubId).limit(1);
  if (missingTable(probe.error, "mp_settlement_matches")) {
    return { error: NextResponse.json({ error: `Falta aplicar ${MATCH_SCRIPT}` }, { status: 503 }) };
  }
  if (probe.error) return { error: NextResponse.json({ error: probe.error.message }, { status: 500 }) };

  const clock = courtDayClock(timeZone);
  const start = businessDayRange(startDate, clock).start;
  const end = businessDayRange(endDate, clock).end;
  const stored = await service
    .from("mp_settlement_rows")
    .select("id, payment_method_id, source_id, transaction_type, payment_method_type, business_unit, sub_unit, transaction_amount, transaction_date")
    .eq("club_id", clubId)
    .in("payment_method_id", paymentMethodIds)
    .gte("transaction_date", start.toISOString())
    .lt("transaction_date", end.toISOString());
  if (missingTable(stored.error, "mp_settlement_rows")) {
    return { error: NextResponse.json({ error: `Falta aplicar ${ROWS_SCRIPT}` }, { status: 503 }) };
  }
  if (stored.error) return { error: NextResponse.json({ error: stored.error.message }, { status: 500 }) };

  const movements = (stored.data ?? []).flatMap((row) => {
    const amountCents = pesosToCents(row.transaction_amount);
    if (amountCents == null || row.transaction_date == null) return [];
    const at = String(row.transaction_date);
    return [{
      id: Number(row.id),
      paymentMethodId: Number(row.payment_method_id),
      sourceId: row.source_id == null ? null : String(row.source_id),
      transactionType: row.transaction_type == null ? null : String(row.transaction_type),
      paymentMethodType: row.payment_method_type == null ? null : String(row.payment_method_type),
      businessUnit: row.business_unit == null ? null : String(row.business_unit),
      subUnit: row.sub_unit == null ? null : String(row.sub_unit),
      amountCents,
      at,
      date: currentBusinessDate(new Date(at), clock),
    }];
  });
  const rowIds = movements.map((row) => row.id);
  if (rowIds.length === 0) return { movements, marks: [] };
  const storedMarks = await service
    .from("mp_settlement_matches")
    .select("settlement_row_id, kind, court_slot_id, seat_index, pack_id")
    .eq("club_id", clubId)
    .in("settlement_row_id", rowIds);
  if (storedMarks.error) return { error: NextResponse.json({ error: storedMarks.error.message }, { status: 500 }) };
  const marks = (storedMarks.data ?? []).map((mark) => ({
    rowId: Number(mark.settlement_row_id),
    kind: mark.kind as SettlementMarkInput["kind"],
    courtSlotId: mark.court_slot_id == null ? null : Number(mark.court_slot_id),
    seatIndex: mark.seat_index == null ? null : Number(mark.seat_index),
    packId: mark.pack_id == null ? null : Number(mark.pack_id),
  }));
  return { movements, marks };
}
