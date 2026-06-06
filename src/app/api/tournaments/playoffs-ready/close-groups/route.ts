export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CloseGroupsError, runCloseGroups } from "@/lib/execute-close-groups";
import { buildPlayoffMatchesPlan } from "@/lib/playoff-matches-plan";
import {
  buildPlayoffScheduleSlots,
  parseScheduleConfigFromBody,
  playoffSlotIntervalFromMinutes,
  type PlayoffScheduleSlot,
} from "@/lib/playoff-schedule-slots";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bodyRaw = await req.json().catch(() => ({}));
  const body =
    typeof bodyRaw === "object" && bodyRaw !== null
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const scheduleConfig = parseScheduleConfigFromBody(body);
  if (!scheduleConfig) {
    return NextResponse.json(
      { error: "Configuración de horarios inválida" },
      { status: 400 }
    );
  }

  const { data: tournaments, error: listError } = await supabase
    .from("tournaments")
    .select("id, name, match_duration, match_duration_quarters_onwards")
    .eq("status", "playoffs_ready")
    .order("id", { ascending: true });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const readyList = tournaments ?? [];
  if (readyList.length === 0) {
    return NextResponse.json(
      { error: "No hay torneos listos para playoffs" },
      { status: 400 }
    );
  }

  const maxPlayoffMin = Math.max(
    15,
    ...readyList.map(
      (t) => t.match_duration_quarters_onwards ?? t.match_duration ?? 60
    )
  );
  const slotInterval = playoffSlotIntervalFromMinutes(maxPlayoffMin);
  const sharedSlots = buildPlayoffScheduleSlots(scheduleConfig, slotInterval);

  if (!sharedSlots?.length) {
    return NextResponse.json(
      {
        error:
          "No se generaron huecos de playoff con la configuración elegida (revisá días, canchas y duración).",
      },
      { status: 400 }
    );
  }

  const plans: Array<{
    id: number;
    name: string;
    needing: number;
    error?: string;
  }> = [];

  for (const t of readyList) {
    const plan = await buildPlayoffMatchesPlan(supabase, t.id);
    if (!plan.ok) {
      plans.push({ id: t.id, name: t.name, needing: 0, error: plan.error });
      continue;
    }
    plans.push({ id: t.id, name: t.name, needing: plan.needingSchedule });
  }

  const failedPlan = plans.find((p) => p.error);
  if (failedPlan) {
    return NextResponse.json(
      {
        error: `No se pudo planificar playoffs para "${failedPlan.name}": ${failedPlan.error}`,
      },
      { status: 400 }
    );
  }

  const totalNeeded = plans.reduce((sum, p) => sum + p.needing, 0);
  if (sharedSlots.length < totalNeeded) {
    return NextResponse.json(
      {
        error: `No hay suficientes slots. Se necesitan ${totalNeeded} para ${plans.length} torneo(s) pero hay ${sharedSlots.length} disponibles.`,
      },
      { status: 400 }
    );
  }

  let slotOffset = 0;
  const results: Array<{
    tournamentId: number;
    name: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const plan of plans) {
    const slice: PlayoffScheduleSlot[] = sharedSlots.slice(
      slotOffset,
      slotOffset + plan.needing
    );
    slotOffset += plan.needing;

    const payload = {
      ...body,
      explicitPlayoffSlots: slice,
    };

    try {
      await runCloseGroups(supabase, user.id, plan.id, payload);
      results.push({
        tournamentId: plan.id,
        name: plan.name,
        ok: true,
      });
    } catch (e) {
      const message =
        e instanceof CloseGroupsError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Error al generar playoffs";
      results.push({
        tournamentId: plan.id,
        name: plan.name,
        ok: false,
        error: message,
      });
      return NextResponse.json(
        { error: `Falló "${plan.name}": ${message}`, partialResults: results },
        { status: e instanceof CloseGroupsError ? e.status : 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    tournamentsProcessed: results.length,
    totalPlayoffMatches: totalNeeded,
    slotsUsed: totalNeeded,
    results,
  });
}
