export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { ClubContextError, clubIdForUser } from "@/lib/clubs/actor-club";
import { loadClubSchedule } from "@/lib/clubs/load-club";
import { businessDayRange, courtDayClock } from "@/lib/clubs/schedule";
import { createRepositories } from "@/lib/repository-factory";
import { createServiceClient } from "@/lib/supabase/service";
import { courtTariffCents } from "@/lib/court-balance";
import { isCourtPaymentScope } from "@/lib/finance/payment-credentials";
import {
  chargeFromSeat,
  chargeKey,
  crossSettlements,
  type ExpectedCharge,
  type SettlementMarkInput,
  type SettlementMovement,
} from "@/lib/finance/settlement-match";
import { methodConsumesCredit } from "@/lib/slot-credits";
import type { CourtSlotWithCourt } from "@/models/db/court";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MATCH_SCRIPT = "scripts/add-mp-settlement-matches.sql";
const ROWS_SCRIPT = "scripts/add-mp-settlement-rows.sql";
const FLAG_SCRIPT = "scripts/add-payment-method-mercadopago.sql";
const MARK_KINDS = new Set(["court_seat", "pack", "yield", "withdrawal", "ignored"]);

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

async function dayContext(userId: string, date: string) {
  const service = createServiceClient();
  const clubId = await clubIdForUser(service, userId);
  const club = await loadClubSchedule(service, clubId);
  const methods = await service
    .from("payment_methods")
    .select("id, name, scope, is_mercadopago")
    .eq("club_id", clubId)
    .eq("is_mercadopago", true);
  if (methods.error && (methods.error.code === "42703" || /is_mercadopago/i.test(methods.error.message ?? ""))) {
    return { error: NextResponse.json({ error: `Falta aplicar ${FLAG_SCRIPT}` }, { status: 503 }) };
  }
  if (methods.error) return { error: NextResponse.json({ error: methods.error.message }, { status: 500 }) };

  const listed = (methods.data ?? []).filter((method) => isCourtPaymentScope(String(method.scope)));
  const paymentMethodIds = listed.map((method) => Number(method.id));
  const names = new Map(listed.map((method) => [Number(method.id), String(method.name)]));
  const { start, end } = businessDayRange(date, courtDayClock(club.timezone));

  const repos = await createRepositories();
  const [slots, tariffs, packs] = await Promise.all([
    repos.courtSlots.findByDate(date),
    repos.courtPricing.findCovering(date),
    repos.slotCredits.listSales(date, date),
  ]);
  const tariffRows = tariffs.map((row) => ({
    courtId: row.court_id,
    startTime: row.start_time,
    endTime: row.end_time,
    pricePerPlayer: row.price_per_player,
    validFrom: row.valid_from ?? "1970-01-01",
    validUntil: row.valid_until ?? null,
  }));

  const charges: ExpectedCharge[] = [];
  const missingTariff = new Map<number, number>();
  for (const slot of slots) {
    if (!slot.was_played) continue;
    const courtName = slot.court?.name ?? "Sin cancha";
    const timeRange = `${clock(slot.start_time)}–${clock(slot.end_time)}`;
    const seats: Array<[number, CourtSlotWithCourt["player1_payment_method"]]> = [
      [1, slot.player1_payment_method],
      [2, slot.player2_payment_method],
      [3, slot.player3_payment_method],
      [4, slot.player4_payment_method],
    ];
    for (const [seatIndex, method] of seats) {
      if (!method || !paymentMethodIds.includes(method.id)) continue;
      const amountCents = courtTariffCents(tariffRows, slot.court?.id ?? slot.court_id ?? null, slot.start_time, date);
      const charge = chargeFromSeat({
        paymentMethodId: method.id,
        consumesCredit: methodConsumesCredit(method),
        amountCents,
        courtSlotId: slot.id,
        seatIndex,
        label: `${courtName} ${timeRange}`,
      });
      if (charge === "skip") continue;
      if (charge === "missing") {
        missingTariff.set(method.id, (missingTariff.get(method.id) ?? 0) + 1);
        continue;
      }
      charges.push(charge);
    }
  }
  for (const pack of packs) {
    if (pack.payment_method_id == null || !paymentMethodIds.includes(pack.payment_method_id)) continue;
    const amountCents = pesosToCents(pack.amount_paid);
    if (amountCents == null) continue;
    const player = `${pack.first_name} ${pack.last_name}`.trim() || "Sin jugador";
    charges.push({
      key: chargeKey({ kind: "pack", courtSlotId: null, seatIndex: null, packId: pack.id }),
      kind: "pack",
      paymentMethodId: pack.payment_method_id,
      amountCents,
      courtSlotId: null,
      seatIndex: null,
      packId: pack.id,
      label: `${player} · ${pack.name}`,
    });
  }

  let movements: SettlementMovement[] = [];
  if (paymentMethodIds.length > 0) {
    const probe = await service.from("mp_settlement_matches").select("id").eq("club_id", clubId).limit(1);
    if (missingTable(probe.error, "mp_settlement_matches")) {
      return { error: NextResponse.json({ error: `Falta aplicar ${MATCH_SCRIPT}` }, { status: 503 }) };
    }
    if (probe.error) return { error: NextResponse.json({ error: probe.error.message }, { status: 500 }) };
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
    movements = (stored.data ?? []).flatMap((row) => {
      const amountCents = pesosToCents(row.transaction_amount);
      if (amountCents == null) return [];
      return [{
        id: Number(row.id),
        paymentMethodId: Number(row.payment_method_id),
        sourceId: row.source_id == null ? null : String(row.source_id),
        transactionType: row.transaction_type == null ? null : String(row.transaction_type),
        paymentMethodType: row.payment_method_type == null ? null : String(row.payment_method_type),
        businessUnit: row.business_unit == null ? null : String(row.business_unit),
        subUnit: row.sub_unit == null ? null : String(row.sub_unit),
        amountCents,
        at: row.transaction_date == null ? null : String(row.transaction_date),
      }];
    });
  }

  const rowIds = movements.map((row) => row.id);
  let marks: SettlementMarkInput[] = [];
  if (rowIds.length > 0) {
    const storedMarks = await service
      .from("mp_settlement_matches")
      .select("settlement_row_id, kind, court_slot_id, seat_index, pack_id")
      .eq("club_id", clubId)
      .in("settlement_row_id", rowIds);
    if (missingTable(storedMarks.error, "mp_settlement_matches")) {
      return { error: NextResponse.json({ error: `Falta aplicar ${MATCH_SCRIPT}` }, { status: 503 }) };
    }
    if (storedMarks.error) return { error: NextResponse.json({ error: storedMarks.error.message }, { status: 500 }) };
    marks = (storedMarks.data ?? []).map((mark) => ({
      rowId: Number(mark.settlement_row_id),
      kind: mark.kind as SettlementMarkInput["kind"],
      courtSlotId: mark.court_slot_id == null ? null : Number(mark.court_slot_id),
      seatIndex: mark.seat_index == null ? null : Number(mark.seat_index),
      packId: mark.pack_id == null ? null : Number(mark.pack_id),
    }));
  }

  const methodsOut = crossSettlements({ paymentMethodIds, charges, rows: movements, marks }).map((method) => ({
    ...method,
    paymentMethodName: names.get(method.paymentMethodId) ?? `Método #${method.paymentMethodId}`,
    missingTariff: missingTariff.get(method.paymentMethodId) ?? 0,
  }));

  return { service, clubId, timezone: club.timezone, methods: methodsOut, charges, movements, marks };
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.manage", "read");
    if (!auth.ok) return auth.response;
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!DATE.test(date)) return NextResponse.json({ error: "La fecha no es válida." }, { status: 400 });
    const day = await dayContext(auth.userId, date);
    if ("error" in day) return day.error;
    return NextResponse.json({ timezone: day.timezone, methods: day.methods });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("finance.manage");
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => null)) as {
      date?: unknown;
      rowId?: unknown;
      mark?: { kind?: unknown; courtSlotId?: unknown; seatIndex?: unknown; packId?: unknown } | null;
    } | null;
    const date = String(body?.date ?? "");
    const rowId = Number(body?.rowId);
    if (!DATE.test(date) || !Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ error: "Elegí el día y el movimiento." }, { status: 400 });
    }

    const day = await dayContext(auth.userId, date);
    if ("error" in day) return day.error;
    const movement = day.movements.find((row) => row.id === rowId);
    if (!movement) {
      return NextResponse.json({ error: "Ese movimiento no es de este día." }, { status: 404 });
    }

    if (body?.mark == null) {
      const removed = await day.service
        .from("mp_settlement_matches")
        .delete()
        .eq("club_id", day.clubId)
        .eq("settlement_row_id", rowId);
      if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const kind = String(body.mark.kind ?? "");
    if (!MARK_KINDS.has(kind)) {
      return NextResponse.json({ error: "Esa marca no es válida." }, { status: 400 });
    }
    const mark: SettlementMarkInput = {
      rowId,
      kind: kind as SettlementMarkInput["kind"],
      courtSlotId: kind === "court_seat" ? Number(body.mark.courtSlotId) : null,
      seatIndex: kind === "court_seat" ? Number(body.mark.seatIndex) : null,
      packId: kind === "pack" ? Number(body.mark.packId) : null,
    };
    if (kind === "court_seat" || kind === "pack") {
      const preview = crossSettlements({
        paymentMethodIds: [movement.paymentMethodId],
        charges: day.charges,
        rows: day.movements,
        marks: day.marks.filter((item) => item.rowId !== rowId),
      });
      const line = preview[0]?.rows.find((row) => row.id === rowId);
      const key = mark.kind === "pack"
        ? chargeKey({ kind: "pack", courtSlotId: null, seatIndex: null, packId: mark.packId })
        : chargeKey({ kind: "court_seat", courtSlotId: mark.courtSlotId, seatIndex: mark.seatIndex, packId: null });
      if (!line?.candidates.some((candidate) => candidate.key === key)) {
        return NextResponse.json({ error: "Ese turno no coincide con el monto, o ya está marcado." }, { status: 400 });
      }
    }

    const saved = await day.service.from("mp_settlement_matches").upsert({
      club_id: day.clubId,
      settlement_row_id: rowId,
      kind: mark.kind,
      court_slot_id: mark.courtSlotId,
      seat_index: mark.seatIndex,
      pack_id: mark.packId,
      user_uid: auth.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "settlement_row_id" });
    if (missingTable(saved.error, "mp_settlement_matches")) {
      return NextResponse.json({ error: `Falta aplicar ${MATCH_SCRIPT}` }, { status: 503 });
    }
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
