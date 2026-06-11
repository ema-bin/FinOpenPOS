/** Partido de zona con al menos el primer set cargado. */
export function groupMatchHasResult(match: {
  set1_team1_games: number | null;
  set1_team2_games: number | null;
}): boolean {
  return match.set1_team1_games !== null && match.set1_team2_games !== null;
}

export function allGroupMatchesHaveResults(
  matches: Array<{
    set1_team1_games: number | null;
    set1_team2_games: number | null;
  }>
): boolean {
  return matches.length > 0 && matches.every(groupMatchHasResult);
}
