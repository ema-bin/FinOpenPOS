/**
 * Calcula los tamaños de cada zona según la cantidad de equipos activos.
 * Misma lógica que close-registration y TeamsTab.
 */
export function computeGroupSizes(activeTeamCount: number): number[] {
  if (activeTeamCount < 3) {
    return [];
  }

  const N = activeTeamCount;
  let baseGroups = Math.floor(N / 3);
  const remainder = N % 3;

  if (baseGroups === 0) {
    baseGroups = 1;
  }

  const groupSizes: number[] = new Array(baseGroups).fill(3);

  if (remainder === 1 && baseGroups >= 1) {
    groupSizes[0] = 4;
  } else if (remainder === 2) {
    if (baseGroups >= 2) {
      groupSizes[0] = 4;
      groupSizes[1] = 4;
    } else if (baseGroups === 1) {
      groupSizes[0] = 4;
    }
  }

  return groupSizes;
}

export type ProjectedQualifiedTeam = {
  team_id: number;
  from_group_id: number;
  pos: number;
};

/**
 * Simula equipos clasificados (1A, 2B, …) a partir de los tamaños de zona proyectados.
 */
export function buildProjectedQualifiedTeams(groupSizes: number[]): {
  qualified: ProjectedQualifiedTeam[];
  placeholderMap: Map<number, string>;
  groupOrderMap: Map<number, number>;
  totalPairs: number;
} {
  const qualified: ProjectedQualifiedTeam[] = [];
  const placeholderMap = new Map<number, string>();
  const groupOrderMap = new Map<number, number>();

  groupSizes.forEach((size, index) => {
    const groupOrder = index + 1;
    const groupId = groupOrder;
    const letter = String.fromCharCode(64 + groupOrder);

    groupOrderMap.set(groupId, groupOrder);

    const qualifiersCount = size === 4 ? 3 : 2;
    for (let pos = 1; pos <= qualifiersCount; pos++) {
      const teamId = groupId * 1000 + pos;
      qualified.push({
        team_id: teamId,
        from_group_id: groupId,
        pos,
      });
      placeholderMap.set(teamId, `${pos}${letter}`);
    }
  });

  return {
    qualified,
    placeholderMap,
    groupOrderMap,
    totalPairs: groupSizes.reduce((sum, size) => sum + size, 0),
  };
}
