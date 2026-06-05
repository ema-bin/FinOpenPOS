export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repository-factory";
import {
  optimizeGroupTeamAssignments,
  type OptimizeGroupTeam,
} from "@/lib/optimize-group-team-assignments";
import { swapTournamentTeams } from "@/lib/tournament-team-swap";

type RouteParams = { params: { id: string } };

export async function POST(_req: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournamentId = Number(params.id);
  if (!Number.isInteger(tournamentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const repos = await createRepositories();

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, status")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.status !== "schedule_review") {
      return NextResponse.json(
        {
          error:
            "Solo se puede optimizar la asignación de zonas en revisión de horarios.",
        },
        { status: 400 }
      );
    }

    const groupsData = await repos.tournamentGroups.getGroupsData(tournamentId);
    if (!groupsData.groups.length) {
      return NextResponse.json({ error: "No hay zonas creadas" }, { status: 400 });
    }

    const allSlotIds = (groupsData.tournamentGroupSlots ?? []).map((s) => s.id);
    if (!allSlotIds.length) {
      return NextResponse.json(
        {
          error:
            "El torneo no tiene slots de horario. Generá los horarios en Equipos primero.",
        },
        { status: 400 }
      );
    }

    const hasResults = groupsData.matches.some(
      (m) =>
        m.status === "finished" ||
        m.set1_team1_games != null ||
        m.set1_team2_games != null
    );
    if (hasResults) {
      return NextResponse.json(
        {
          error:
            "No se puede optimizar zonas si ya hay resultados cargados en partidos de zona.",
        },
        { status: 400 }
      );
    }

    const teamsByGroup = new Map<number, typeof groupsData.groupTeams>();
    for (const gt of groupsData.groupTeams) {
      const list = teamsByGroup.get(gt.tournament_group_id) ?? [];
      list.push(gt);
      teamsByGroup.set(gt.tournament_group_id, list);
    }

    const fixedHeadTeamIds = new Set<number>();
    for (const [, teams] of Array.from(teamsByGroup.entries())) {
      const sorted = [...teams].sort((a, b) => {
        const orderA = a.team?.display_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.team?.display_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.team?.id ?? 0) - (b.team?.id ?? 0);
      });
      const headId = sorted[0]?.team?.id;
      if (headId) fixedHeadTeamIds.add(headId);
    }

    const teamIds = groupsData.groupTeams
      .map((gt) => gt.team?.id)
      .filter((id): id is number => Boolean(id));

    const restrictedSlotIdsMap = new Map<number, number[]>();
    if (teamIds.length > 0) {
      const { data: restrictions, error: restrictionsError } = await supabase
        .from("tournament_team_schedule_restrictions")
        .select("tournament_team_id, tournament_group_slot_id, can_play")
        .in("tournament_team_id", teamIds);

      if (restrictionsError) {
        return NextResponse.json(
          { error: "No se pudieron cargar las restricciones horarias" },
          { status: 500 }
        );
      }

      for (const row of restrictions ?? []) {
        if (row.can_play !== false) continue;
        const teamId = row.tournament_team_id;
        if (!restrictedSlotIdsMap.has(teamId)) restrictedSlotIdsMap.set(teamId, []);
        restrictedSlotIdsMap.get(teamId)!.push(row.tournament_group_slot_id);
      }
    }

    const optimizeGroupTeams: OptimizeGroupTeam[] = groupsData.groupTeams
      .filter((gt) => gt.team?.id)
      .map((gt) => ({
        teamId: gt.team!.id,
        groupId: gt.tournament_group_id,
        restrictedSlotIds: restrictedSlotIdsMap.get(gt.team!.id) ?? [],
        isFixedHead: fixedHeadTeamIds.has(gt.team!.id),
      }));

    const plan = optimizeGroupTeamAssignments({
      groups: groupsData.groups.map((g) => ({ id: g.id })),
      groupTeams: optimizeGroupTeams,
      matches: groupsData.matches.map((m) => ({
        tournament_group_id: m.tournament_group_id!,
        team1_id: m.team1?.id ?? null,
        team2_id: m.team2?.id ?? null,
        match_order: m.match_order,
      })),
      allSlotIds,
    });

    if (!plan.improved || plan.swaps.length === 0) {
      return NextResponse.json({
        ok: true,
        swapsApplied: 0,
        improved: false,
        scoreBefore: plan.scoreBefore,
        scoreAfter: plan.scoreAfter,
        message:
          "La asignación actual ya es óptima o no hay intercambios que mejoren la compatibilidad.",
      });
    }

    for (const swap of plan.swaps) {
      if (fixedHeadTeamIds.has(swap.team1Id) || fixedHeadTeamIds.has(swap.team2Id)) {
        return NextResponse.json(
          { error: "El plan de optimización incluye cabezas de zona (no permitido)." },
          { status: 500 }
        );
      }
      await swapTournamentTeams(supabase, user.id, tournamentId, swap);
    }

    return NextResponse.json({
      ok: true,
      swapsApplied: plan.swaps.length,
      improved: true,
      scoreBefore: plan.scoreBefore,
      scoreAfter: plan.scoreAfter,
      message: `Se aplicaron ${plan.swaps.length} intercambio(s) para mejorar la compatibilidad horaria.`,
    });
  } catch (error) {
    console.error("POST optimize-group-assignments error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al optimizar asignación de zonas",
      },
      { status: 500 }
    );
  }
}
