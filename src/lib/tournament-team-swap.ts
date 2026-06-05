import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamSwapParams = {
  team1Id: number;
  group1Id: number;
  team2Id: number;
  group2Id: number;
};

/**
 * Intercambia dos equipos entre zonas (o dentro de la misma zona) actualizando
 * tournament_matches y tournament_group_teams.
 */
export async function swapTournamentTeams(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: number,
  params: TeamSwapParams
): Promise<void> {
  const { team1Id, group1Id, team2Id, group2Id } = params;

  if (team1Id === team2Id && group1Id === group2Id) {
    throw new Error("Cannot swap team with itself");
  }

  const uniqueGroupIds =
    group1Id === group2Id ? [group1Id] : [group1Id, group2Id];

  const { data: groups, error: groupsError } = await supabase
    .from("tournament_groups")
    .select("id, tournament_id")
    .in("id", uniqueGroupIds)
    .eq("tournament_id", tournamentId);

  if (groupsError || !groups || groups.length !== uniqueGroupIds.length) {
    throw new Error("Groups not found or invalid");
  }

  const { data: teams, error: teamsError } = await supabase
    .from("tournament_teams")
    .select("id, tournament_id")
    .in("id", [team1Id, team2Id])
    .eq("tournament_id", tournamentId);

  if (teamsError || !teams || teams.length !== 2) {
    throw new Error("Teams not found or invalid");
  }

  const { data: groupTeams, error: groupTeamsError } = await supabase
    .from("tournament_group_teams")
    .select("team_id, tournament_group_id")
    .in("team_id", [team1Id, team2Id])
    .in("tournament_group_id", uniqueGroupIds);

  if (groupTeamsError || !groupTeams) {
    throw new Error("Error verifying team-group assignments");
  }

  const team1InGroup1 = groupTeams.some(
    (gt) => gt.team_id === team1Id && gt.tournament_group_id === group1Id
  );
  const team2InGroup2 = groupTeams.some(
    (gt) => gt.team_id === team2Id && gt.tournament_group_id === group2Id
  );

  if (!team1InGroup1 || !team2InGroup2) {
    throw new Error("Teams are not in the specified groups");
  }

  const { data: allMatches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select("id, team1_id, team2_id")
    .eq("tournament_id", tournamentId)
    .eq("phase", "group")
    .or(
      `team1_id.eq.${team1Id},team2_id.eq.${team1Id},team1_id.eq.${team2Id},team2_id.eq.${team2Id}`
    );

  if (matchesError) {
    throw new Error("Error fetching matches");
  }

  for (const match of allMatches ?? []) {
    const newTeam1Id =
      match.team1_id === team1Id
        ? team2Id
        : match.team1_id === team2Id
          ? team1Id
          : match.team1_id;
    const newTeam2Id =
      match.team2_id === team1Id
        ? team2Id
        : match.team2_id === team2Id
          ? team1Id
          : match.team2_id;

    if (newTeam1Id !== match.team1_id || newTeam2Id !== match.team2_id) {
      const { error } = await supabase
        .from("tournament_matches")
        .update({
          team1_id: newTeam1Id,
          team2_id: newTeam2Id,
        })
        .eq("id", match.id);
      if (error) throw new Error(error.message);
    }
  }

  if (group1Id !== group2Id) {
    const { error: del1Error } = await supabase
      .from("tournament_group_teams")
      .delete()
      .eq("team_id", team1Id)
      .eq("tournament_group_id", group1Id);
    if (del1Error) throw new Error(del1Error.message);

    const { error: del2Error } = await supabase
      .from("tournament_group_teams")
      .delete()
      .eq("team_id", team2Id)
      .eq("tournament_group_id", group2Id);
    if (del2Error) throw new Error(del2Error.message);

    const { error: ins1Error } = await supabase
      .from("tournament_group_teams")
      .insert({
        team_id: team1Id,
        tournament_group_id: group2Id,
        user_uid: userId,
      });
    if (ins1Error) throw new Error(ins1Error.message);

    const { error: ins2Error } = await supabase
      .from("tournament_group_teams")
      .insert({
        team_id: team2Id,
        tournament_group_id: group1Id,
        user_uid: userId,
      });
    if (ins2Error) throw new Error(ins2Error.message);
  }
}
