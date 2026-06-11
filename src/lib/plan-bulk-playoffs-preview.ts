import type { SupabaseClient } from "@supabase/supabase-js";
import { assignPlayoffScheduleSlots } from "@/lib/assign-playoff-schedule-to-matches";
import { interleavePlayoffSlotsAcrossTournaments } from "@/lib/interleave-playoff-slots";
import {
  buildPlayoffMatchesPlan,
  type PlayoffBracketMatch,
} from "@/lib/playoff-matches-plan";
import {
  buildPlayoffScheduleSlots,
  parseScheduleConfigFromBody,
  playoffSlotIntervalFromMinutes,
} from "@/lib/playoff-schedule-slots";

export type PlannedPlayoffMatchPreview = {
  round: string;
  bracket_pos: number;
  team1Label: string;
  team2Label: string;
  match_date: string | null;
  start_time: string | null;
  end_time: string | null;
  court_id: number | null;
};

export type PlannedTournamentPreview = {
  id: number;
  name: string;
  match_duration: number | null;
  match_duration_quarters_onwards: number | null;
  matches: PlannedPlayoffMatchPreview[];
};

export class BulkPlayoffsPlanError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BulkPlayoffsPlanError";
  }
}

async function loadTeamLabels(
  supabase: SupabaseClient,
  tournamentId: number,
  teamIds: number[]
): Promise<Map<number, string>> {
  const unique = Array.from(new Set(teamIds.filter((id) => id > 0)));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("tournament_teams")
    .select(
      `
      id,
      display_name,
      player1:player1_id ( last_name ),
      player2:player2_id ( last_name )
    `
    )
    .eq("tournament_id", tournamentId)
    .in("id", unique);

  if (error) {
    throw new BulkPlayoffsPlanError("No se pudieron cargar los equipos", 500);
  }

  const map = new Map<number, string>();
  for (const row of data ?? []) {
    const r = row as {
      id: number;
      display_name: string | null;
      player1?: { last_name?: string } | null;
      player2?: { last_name?: string } | null;
    };
    if (r.display_name?.trim()) {
      map.set(r.id, r.display_name.trim());
      continue;
    }
    const p1 = r.player1?.last_name?.trim() ?? "";
    const p2 = r.player2?.last_name?.trim() ?? "";
    const label = `${p1} / ${p2}`.replace(/^\/\s*|\s*\/\s*$/g, "").trim();
    map.set(r.id, label || `Equipo ${r.id}`);
  }
  return map;
}

function teamLabelFromMap(
  teamId: number | null,
  labels: Map<number, string>,
  source: string | null
): string {
  if (teamId && labels.has(teamId)) return labels.get(teamId)!;
  if (teamId) return `Equipo ${teamId}`;
  if (source) return source;
  return "—";
}

export async function planBulkPlayoffsPreview(
  supabase: SupabaseClient,
  body: Record<string, unknown>
): Promise<{
  tournaments: PlannedTournamentPreview[];
  totalPlayoffMatches: number;
  slotsUsed: number;
}> {
  const scheduleConfig = parseScheduleConfigFromBody(body);
  if (!scheduleConfig) {
    throw new BulkPlayoffsPlanError(
      "Configuración de horarios inválida",
      400
    );
  }

  const { data: readyList, error: listError } = await supabase
    .from("tournaments")
    .select("id, name, match_duration, match_duration_quarters_onwards")
    .eq("status", "playoffs_ready")
    .order("id", { ascending: true });

  if (listError) {
    throw new BulkPlayoffsPlanError(listError.message, 500);
  }

  const tournaments = readyList ?? [];
  if (tournaments.length === 0) {
    throw new BulkPlayoffsPlanError(
      "No hay torneos listos para playoffs",
      400
    );
  }

  const maxPlayoffMin = Math.max(
    15,
    ...tournaments.map(
      (t) => t.match_duration_quarters_onwards ?? t.match_duration ?? 60
    )
  );
  const slotInterval = playoffSlotIntervalFromMinutes(maxPlayoffMin);
  const sharedSlots = buildPlayoffScheduleSlots(scheduleConfig, slotInterval);

  if (!sharedSlots?.length) {
    throw new BulkPlayoffsPlanError(
      "No se generaron huecos de playoff con la configuración elegida (revisá días, canchas y duración).",
      400
    );
  }

  const plans: Array<{
    id: number;
    name: string;
    needing: number;
    playoffMatches: PlayoffBracketMatch[];
  }> = [];

  for (const t of tournaments) {
    const plan = await buildPlayoffMatchesPlan(supabase, t.id);
    if (!plan.ok) {
      throw new BulkPlayoffsPlanError(
        `No se pudo planificar playoffs para "${t.name}": ${plan.error}`,
        400
      );
    }
    plans.push({
      id: t.id,
      name: t.name,
      needing: plan.needingSchedule,
      playoffMatches: plan.matches,
    });
  }

  const totalNeeded = plans.reduce((sum, p) => sum + p.needing, 0);
  if (sharedSlots.length < totalNeeded) {
    throw new BulkPlayoffsPlanError(
      `No hay suficientes slots. Se necesitan ${totalNeeded} para ${plans.length} torneo(s) pero hay ${sharedSlots.length} disponibles.`,
      400
    );
  }

  const slotsByTournament = interleavePlayoffSlotsAcrossTournaments(
    sharedSlots,
    plans.map((p) => ({ id: p.id, needing: p.needing }))
  );

  const previewTournaments: PlannedTournamentPreview[] = [];

  for (const t of tournaments) {
    const planEntry = plans.find((p) => p.id === t.id)!;
    const playoffMin = Math.max(
      15,
      t.match_duration_quarters_onwards ?? t.match_duration ?? 60
    );
    const slice = slotsByTournament.get(t.id) ?? [];
    const scheduled = assignPlayoffScheduleSlots(
      planEntry.playoffMatches,
      slice,
      playoffMin
    );

    const teamIds = scheduled.flatMap((m) =>
      [m.team1_id, m.team2_id].filter((id): id is number => Boolean(id))
    );
    const labels = await loadTeamLabels(supabase, t.id, teamIds);

    const matches: PlannedPlayoffMatchPreview[] = scheduled
      .filter(
        (m) =>
          m.team1_id ||
          m.team2_id ||
          m.source_team1 ||
          m.source_team2 ||
          m.match_date
      )
      .map((m) => ({
        round: m.round,
        bracket_pos: m.bracket_pos,
        team1Label: teamLabelFromMap(m.team1_id, labels, m.source_team1),
        team2Label: teamLabelFromMap(m.team2_id, labels, m.source_team2),
        match_date: m.match_date,
        start_time: m.start_time,
        end_time: m.end_time,
        court_id: m.court_id,
      }));

    previewTournaments.push({
      id: t.id,
      name: t.name,
      match_duration: t.match_duration,
      match_duration_quarters_onwards: t.match_duration_quarters_onwards,
      matches,
    });
  }

  return {
    tournaments: previewTournaments,
    totalPlayoffMatches: totalNeeded,
    slotsUsed: totalNeeded,
  };
}

export async function planSinglePlayoffsPreview(
  supabase: SupabaseClient,
  tournamentId: number,
  body: Record<string, unknown>
): Promise<{
  tournament: PlannedTournamentPreview;
  totalPlayoffMatches: number;
  slotsUsed: number;
}> {
  const scheduleConfig = parseScheduleConfigFromBody(body);
  if (!scheduleConfig) {
    throw new BulkPlayoffsPlanError(
      "Configuración de horarios inválida",
      400
    );
  }

  const { data: t, error: terr } = await supabase
    .from("tournaments")
    .select("id, name, status, match_duration, match_duration_quarters_onwards")
    .eq("id", tournamentId)
    .single();

  if (terr || !t) {
    throw new BulkPlayoffsPlanError("Torneo no encontrado", 404);
  }

  if (t.status !== "playoffs_ready" && t.status !== "in_progress") {
    throw new BulkPlayoffsPlanError(
      "El torneo debe estar listo para playoffs o en progreso",
      400
    );
  }

  const { data: existingPlayoffs, error: existingError } = await supabase
    .from("tournament_playoffs")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1);

  if (existingError) {
    throw new BulkPlayoffsPlanError("No se pudo verificar playoffs existentes", 500);
  }

  if (existingPlayoffs && existingPlayoffs.length > 0) {
    throw new BulkPlayoffsPlanError(
      "Ya hay playoffs generados para este torneo",
      400
    );
  }

  const plan = await buildPlayoffMatchesPlan(supabase, tournamentId);
  if (!plan.ok) {
    throw new BulkPlayoffsPlanError(plan.error, 400);
  }

  const playoffMin = Math.max(
    15,
    t.match_duration_quarters_onwards ?? t.match_duration ?? 60
  );
  const slotInterval = playoffSlotIntervalFromMinutes(playoffMin);
  const slots = buildPlayoffScheduleSlots(scheduleConfig, slotInterval);

  if (!slots?.length) {
    throw new BulkPlayoffsPlanError(
      "No se generaron huecos de playoff con la configuración elegida (revisá días, canchas y duración).",
      400
    );
  }

  if (slots.length < plan.needingSchedule) {
    throw new BulkPlayoffsPlanError(
      `No hay suficientes slots. Se necesitan ${plan.needingSchedule} partido(s) pero hay ${slots.length} disponibles.`,
      400
    );
  }

  const scheduled = assignPlayoffScheduleSlots(
    plan.matches,
    slots,
    playoffMin
  );

  const teamIds = scheduled.flatMap((m) =>
    [m.team1_id, m.team2_id].filter((id): id is number => Boolean(id))
  );
  const labels = await loadTeamLabels(supabase, tournamentId, teamIds);

  const matches: PlannedPlayoffMatchPreview[] = scheduled
    .filter(
      (m) =>
        m.team1_id ||
        m.team2_id ||
        m.source_team1 ||
        m.source_team2 ||
        m.match_date
    )
    .map((m) => ({
      round: m.round,
      bracket_pos: m.bracket_pos,
      team1Label: teamLabelFromMap(m.team1_id, labels, m.source_team1),
      team2Label: teamLabelFromMap(m.team2_id, labels, m.source_team2),
      match_date: m.match_date,
      start_time: m.start_time,
      end_time: m.end_time,
      court_id: m.court_id,
    }));

  return {
    tournament: {
      id: t.id,
      name: t.name,
      match_duration: t.match_duration,
      match_duration_quarters_onwards: t.match_duration_quarters_onwards,
      matches,
    },
    totalPlayoffMatches: plan.needingSchedule,
    slotsUsed: plan.needingSchedule,
  };
}
