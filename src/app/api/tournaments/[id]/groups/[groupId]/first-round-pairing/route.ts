export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  detectGroupOfFourPairingPreset,
  orderGroupOfFourTeamIds,
  pairingFromMatch1Teams,
  pairingFromPreset,
  type GroupOfFourPairingPreset,
} from "@/lib/group-of-four-pairings";

type RouteParams = { params: { id: string; groupId: string } };

export async function PATCH(request: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tournamentId = Number(params.id);
  const groupId = Number(params.groupId);
  if (Number.isNaN(tournamentId) || Number.isNaN(groupId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await request.json()) as {
    preset?: GroupOfFourPairingPreset;
    match1_team1_id?: number;
    match1_team2_id?: number;
  };

  const { data: groupTeams, error: gtError } = await supabase
    .from("tournament_group_teams")
    .select("team_id, team:tournament_teams(id, display_order)")
    .eq("tournament_group_id", groupId);

  if (gtError || !groupTeams?.length) {
    return NextResponse.json({ error: "Zona no encontrada" }, { status: 404 });
  }

  const teamIds = groupTeams.map((row) => row.team_id);
  if (teamIds.length !== 4) {
    return NextResponse.json(
      { error: "Solo aplica a zonas de 4 equipos" },
      { status: 400 }
    );
  }

  const teams = groupTeams.map((row) => {
    const team = Array.isArray(row.team) ? row.team[0] : row.team;
    return {
      id: row.team_id,
      display_order: team?.display_order ?? null,
    };
  });

  let orderedTeamIds: number[];
  try {
    orderedTeamIds = orderGroupOfFourTeamIds(teamIds, teams);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Equipos inválidos" },
      { status: 400 }
    );
  }

  let pairing;
  if (body.preset) {
    pairing = pairingFromPreset(
      orderedTeamIds as [number, number, number, number],
      body.preset
    );
  } else if (
    body.match1_team1_id != null &&
    body.match1_team2_id != null &&
    !Number.isNaN(Number(body.match1_team1_id)) &&
    !Number.isNaN(Number(body.match1_team2_id))
  ) {
    pairing = pairingFromMatch1Teams(
      teamIds,
      Number(body.match1_team1_id),
      Number(body.match1_team2_id)
    );
    if (!pairing) {
      return NextResponse.json(
        { error: "Emparejamiento inválido para la zona" },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { error: "Indicá preset o match1_team1_id y match1_team2_id" },
      { status: 400 }
    );
  }

  const { data: matches, error: mError } = await supabase
    .from("tournament_matches")
    .select("id, match_order, status, set1_team1_games, team1_id, team2_id")
    .eq("tournament_group_id", groupId)
    .eq("phase", "group")
    .in("match_order", [1, 2, 3, 4]);

  if (mError || !matches?.length) {
    return NextResponse.json(
      { error: "No se encontraron partidos de la zona" },
      { status: 404 }
    );
  }

  const byOrder = new Map(matches.map((m) => [m.match_order, m]));
  const m1 = byOrder.get(1);
  const m2 = byOrder.get(2);
  const m3 = byOrder.get(3);
  const m4 = byOrder.get(4);

  if (!m1 || !m2 || !m3 || !m4) {
    return NextResponse.json(
      { error: "La zona no tiene el formato de 4 partidos esperado" },
      { status: 400 }
    );
  }

  const firstRoundBlocked = [m1, m2].some(
    (m) =>
      m.status === "finished" ||
      m.set1_team1_games != null ||
      (m3.team1_id != null || m3.team2_id != null) ||
      (m4.team1_id != null || m4.team2_id != null)
  );

  if (firstRoundBlocked) {
    return NextResponse.json(
      {
        error:
          "No se puede cambiar el emparejamiento: ya hay resultados o partidos de definición generados",
      },
      { status: 409 }
    );
  }

  const updates = [
    {
      id: m1.id,
      team1_id: pairing.match1[0],
      team2_id: pairing.match1[1],
    },
    {
      id: m2.id,
      team1_id: pairing.match2[0],
      team2_id: pairing.match2[1],
    },
    { id: m3.id, team1_id: null, team2_id: null },
    { id: m4.id, team1_id: null, team2_id: null },
  ];

  for (const row of updates) {
    const { error } = await supabase
      .from("tournament_matches")
      .update({
        team1_id: row.team1_id,
        team2_id: row.team2_id,
      })
      .eq("id", row.id)
      .eq("tournament_id", tournamentId);

    if (error) {
      console.error("PATCH first-round-pairing update error:", error);
      return NextResponse.json(
        { error: "No se pudo actualizar el emparejamiento" },
        { status: 500 }
      );
    }
  }

  const preset =
    body.preset ??
    detectGroupOfFourPairingPreset(
      orderedTeamIds as [number, number, number, number],
      pairing.match1,
      pairing.match2
    );

  return NextResponse.json({
    ok: true,
    preset,
    pairing: {
      match1: { team1_id: pairing.match1[0], team2_id: pairing.match1[1] },
      match2: { team1_id: pairing.match2[0], team2_id: pairing.match2[1] },
    },
  });
}
