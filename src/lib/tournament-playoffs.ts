/**
 * Lógica para generar playoffs de torneos
 * 
 * Reglas:
 * - Zonas de 3: clasifican 2 (1° y 2°)
 * - Zonas de 4: clasifican 3 (1°, 2° y 3°)
 * - Ranking global fijo: 1A, 1B, 1C, 1D, 1E, 2E, 2D, 2C, 2B, 2A, 3A, 3B, ...
 * - Byes van a los mejores rankeados
 * - Cruces: mejor vs peor disponible (determinístico basado en seed)
 */

export type QualifiedTeam = {
  team_id: number;
  from_group_id: number;
  pos: number; // 1, 2, o 3
  group_order: number; // Orden de la zona (1=A, 2=B, etc.)
};

export type PlayoffMatch = {
  round: string;
  bracket_pos: number;
  team1_id: number | null;
  team2_id: number | null;
  source_team1: string | null;
  source_team2: string | null;
};

/**
 * Construye el ranking global de clasificados según las reglas del torneo.
 * 
 * Ranking fijo:
 * 1. 1A, 1B, 1C, 1D, 1E, ... (todos los 1ros en orden normal)
 * 2. 2E, 2D, 2C, 2B, 2A, ... (todos los 2dos en orden inverso)
 * 3. 3A, 3B, 3C, 3D, 3E, ... (todos los 3ros en orden normal)
 * 
 * @param qualifiedTeams Equipos clasificados con su posición y grupo
 * @returns Equipos ordenados según el ranking global
 */
export function buildGlobalRanking(qualifiedTeams: QualifiedTeam[]): QualifiedTeam[] {
  // Separar por posición
  const firsts = qualifiedTeams.filter(t => t.pos === 1);
  const seconds = qualifiedTeams.filter(t => t.pos === 2);
  const thirds = qualifiedTeams.filter(t => t.pos === 3);

  // Ordenar:
  // - 1ros: orden normal por group_order (A, B, C, ...)
  firsts.sort((a, b) => a.group_order - b.group_order);
  
  // - 2dos: orden inverso por group_order (E, D, C, B, A)
  seconds.sort((a, b) => b.group_order - a.group_order);
  
  // - 3ros: orden normal por group_order (A, B, C, ...)
  thirds.sort((a, b) => a.group_order - b.group_order);

  // Concatenar: 1ros, luego 2dos, luego 3ros
  return [...firsts, ...seconds, ...thirds];
}

/**
 * Calcula cuántos equipos deben jugar en la primera ronda y cuántos tienen bye.
 * 
 * Estrategia: queremos que la siguiente ronda tenga una potencia de 2.
 * - Si totalTeams es potencia de 2: todos juegan, siguiente ronda = totalTeams/2
 * - Si no: algunos tienen bye para que la siguiente ronda sea la potencia de 2 más cercana
 * 
 * @param totalTeams Total de equipos clasificados
 * @returns Información sobre la primera ronda
 */
export function calculateFirstRound(totalTeams: number): {
  firstRoundName: string;
  teamsPlaying: number;
  teamsWithBye: number;
  nextRoundSize: number;
} {
  if (totalTeams <= 2) {
    return { 
      firstRoundName: "final", 
      teamsPlaying: totalTeams, 
      teamsWithBye: 0, 
      nextRoundSize: 2 
    };
  }

  // Encontrar la potencia de 2 más cercana que sea >= totalTeams/2
  // Esta será el tamaño objetivo de la siguiente ronda
  // Ejemplo: con 10 equipos, queremos que la siguiente ronda tenga 8 (cuartos)
  const targetNextRound = Math.ceil(totalTeams / 2);
  let nextRoundSize = 1;
  while (nextRoundSize < targetNextRound) {
    nextRoundSize *= 2;
  }
  // Si targetNextRound es potencia de 2, nextRoundSize ya es correcto
  // Si no, nextRoundSize es la potencia de 2 más cercana por encima

  // Calcular cuántos equipos deben jugar para que la siguiente ronda tenga nextRoundSize equipos
  // Queremos: teamsPlaying/2 + teamsWithBye = nextRoundSize
  // Donde: teamsWithBye = totalTeams - teamsPlaying
  // Resolviendo: teamsPlaying = 2 * (totalTeams - nextRoundSize)
  let teamsPlaying = 2 * (totalTeams - nextRoundSize);
  let teamsWithBye = totalTeams - teamsPlaying;

  // Validar que teamsPlaying sea par y positivo
  if (teamsPlaying <= 0 || teamsPlaying % 2 !== 0) {
    // Si la fórmula no funciona, ajustar
    // Esto puede pasar si nextRoundSize es muy grande
    // En ese caso, hacer que todos jueguen
    teamsPlaying = totalTeams % 2 === 0 ? totalTeams : totalTeams - 1;
    teamsWithBye = totalTeams - teamsPlaying;
    const calculatedNextRoundSize = Math.floor(teamsPlaying / 2);
    
    // Asegurar que nextRoundSize sea una potencia de 2
    // Encontrar la potencia de 2 más cercana (redondear hacia arriba)
    let adjustedNextRoundSize = 1;
    while (adjustedNextRoundSize < calculatedNextRoundSize) {
      adjustedNextRoundSize *= 2;
    }
    nextRoundSize = adjustedNextRoundSize;
  }

  // Determinar el nombre de la primera ronda basado en cuántos equipos hay en la siguiente ronda
  // El nombre de la ronda indica cuántos equipos participan en esa ronda
  // Si hay partidos, la siguiente ronda tiene: teamsPlaying/2 + teamsWithBye = nextRoundSize
  // Si no hay partidos, todos van directo a la siguiente ronda
  let firstRoundName = "cuartos";
  if (teamsPlaying > 0) {
    // Hay partidos: el nombre se basa en cuántos equipos hay en la siguiente ronda
    // nextRoundSize es el número de equipos que habrá en la siguiente ronda
    if (nextRoundSize >= 16) firstRoundName = "16avos";
    else if (nextRoundSize >= 8) firstRoundName = "octavos";
    else if (nextRoundSize >= 4) firstRoundName = "cuartos";
    else if (nextRoundSize >= 2) firstRoundName = "semifinal";
    else firstRoundName = "final";
  } else {
    // Todos tienen bye, el nombre depende de nextRoundSize
    if (nextRoundSize >= 16) firstRoundName = "16avos";
    else if (nextRoundSize >= 8) firstRoundName = "octavos";
    else if (nextRoundSize >= 4) firstRoundName = "cuartos";
    else if (nextRoundSize >= 2) firstRoundName = "semifinal";
    else firstRoundName = "final";
  }

  return { firstRoundName, teamsPlaying, teamsWithBye, nextRoundSize };
}

/**
 * Orden estándar de seeds para el bracket (posición i recibe el seed seedOrder[i]).
 * Patrón: [1, 8, 4, 5, 2, 7, 3, 6] para 8 posiciones.
 */
function getStandardSeedOrder(size: number): number[] {
  if (!Number.isInteger(size) || size < 1) {
    return Array.from({ length: Math.max(1, Math.floor(size)) }, (_, i) => i + 1);
  }
  if (size === 1) return [1];
  if (size === 2) return [1, 2];
  if (size % 2 !== 0 || size < 2) {
    return Array.from({ length: size }, (_, i) => i + 1);
  }
  const half = size / 2;
  if (!Number.isInteger(half) || half < 1 || size > 1024) {
    return Array.from({ length: size }, (_, i) => i + 1);
  }
  const firstHalf = getStandardSeedOrder(half);
  if (firstHalf.length !== half) {
    return Array.from({ length: size }, (_, i) => i + 1);
  }
  const result: number[] = [];
  for (let i = 0; i < half; i++) {
    result.push(firstHalf[i]);
    result.push(size - firstHalf[i] + 1);
  }
  return result;
}

/**
 * Distribuye equipos en posiciones del bracket en tres fases:
 * 1. 1ros de cada zona: se asignan a las mejores posiciones en orden (1A, 1B, 1C, ...).
 * 2a. Cabezas de bracket (posiciones seed 1 y 2): se rellenan con 2dos en orden 2F, 2E, 2D, ...
 *     cada uno en la mitad opuesta a su 1ro (máximo 2 equipos, uno por cabeza).
 * 2b. 2dos restantes: se asignan al mejor hueco disponible en la mitad opuesta a su 1ro;
 *     ya tendrán rival en el bracket (1ro u otro 2do).
 * 3. 3ros (si hay): ocupan los huecos restantes.
 *
 * @param teams Lista de equipos en ranking global (1A, 1B, ..., 2E, 2D, ..., 3A, ...)
 * @param numPositions Número de posiciones en el bracket
 * @returns Array de equipos distribuidos en las posiciones del bracket (null para posiciones sin equipo)
 */
function seedByeTeams(teams: QualifiedTeam[], numPositions: number): (QualifiedTeam | null)[] {
  const seeded: (QualifiedTeam | null)[] = new Array(numPositions).fill(null);
  if (teams.length === 0) return seeded;

  const seedOrder = getStandardSeedOrder(numPositions);
  // Posiciones ordenadas por "calidad" del slot (mejor slot = seed más bajo)
  const positionsByQuality = Array.from({ length: numPositions }, (_, i) => i)
    .sort((a, b) => seedOrder[a] - seedOrder[b]);
  const available = new Set(positionsByQuality);
  const halfSize = Math.floor(numPositions / 2);
  const isTopHalf = (pos: number) => pos < halfSize;

  // Orden de asignación: 1ros (A,B,C,...), 2dos (E,D,C,B,A), 3ros (A,B,C,...)
  const firsts = teams.filter(t => t.pos === 1).sort((a, b) => a.group_order - b.group_order);
  const seconds = teams.filter(t => t.pos === 2).sort((a, b) => b.group_order - a.group_order);
  const thirds = teams.filter(t => t.pos === 3).sort((a, b) => a.group_order - b.group_order);

  const groupHalf = new Map<number, number>(); // group_order -> 0 = top, 1 = bottom

  // Par del bracket: la otra posición del mismo partido de primera ronda (0-1, 2-3, 4-5, ...)
  const getPartner = (pos: number) => (pos % 2 === 0 ? pos + 1 : pos - 1);

  function pickBestPosition(requireHalf?: number): number | null {
    for (const pos of positionsByQuality) {
      if (!available.has(pos)) continue;
      if (requireHalf !== undefined) {
        const half = isTopHalf(pos) ? 0 : 1;
        if (half !== requireHalf) continue;
      }
      return pos;
    }
    return null;
  }

  /** Mejor hueco en la mitad indicada donde ya hay rival (el par del bracket está ocupado). */
  function pickBestPositionWithRival(requireHalf?: number): number | null {
    for (const pos of positionsByQuality) {
      if (!available.has(pos)) continue;
      if (seeded[getPartner(pos)] === null) continue; // solo huecos que ya tienen rival
      if (requireHalf !== undefined) {
        const half = isTopHalf(pos) ? 0 : 1;
        if (half !== requireHalf) continue;
      }
      return pos;
    }
    return null;
  }

  // Fase 1: 1ros quedan fijados en las mejores posiciones (1A, 1B, 1C, …). No se mueve nada.
  for (const team of firsts) {
    const pos = pickBestPosition();
    if (pos === null) break;
    seeded[pos] = team;
    available.delete(pos);
    groupHalf.set(team.group_order, isTopHalf(pos) ? 0 : 1);
  }

  // Cabezas de bracket = posiciones seed 1 y 2 (una por mitad)
  const cabezaPositions = positionsByQuality
    .filter((pos) => seedOrder[pos] <= 2)
    .map((pos) => ({ pos, half: isTopHalf(pos) ? 0 : 1 }));

  // Fase 2a.1: Solo los huecos que quedaron (si faltan cabezas u otras posiciones) se rellenan con 2dos (2F, 2E…), mitad contraria al 1ro
  const placedSecondIds = new Set<number>();
  for (const cabeza of cabezaPositions) {
    if (!available.has(cabeza.pos)) continue;
    const halfOfThisCabeza = cabeza.half;
    const team = seconds.find((s) => {
      if (placedSecondIds.has(s.team_id)) return false;
      const halfOfFirstInZone = groupHalf.get(s.group_order);
      const oppositeHalfOfFirst = halfOfFirstInZone === undefined ? undefined : halfOfFirstInZone === 0 ? 1 : 0;
      return oppositeHalfOfFirst === undefined || oppositeHalfOfFirst === halfOfThisCabeza;
    });
    if (team) {
      seeded[cabeza.pos] = team;
      available.delete(cabeza.pos);
      placedSecondIds.add(team.team_id);
    }
  }
  const secondsLeftFor2b = seconds.filter((s) => !placedSecondIds.has(s.team_id));

  // Fase 2a.2: 2dos restantes — cada hueco n del bracket recibe el 2do que corresponde (por calidad y mitad)
  // Se recorre por HUECO (orden de calidad): el mejor hueco vacío recibe el mejor 2do que encaje en esa mitad.
  const emptyByQuality = positionsByQuality.filter((p) => available.has(p));
  const placedSecondIds2 = new Set(placedSecondIds);
  for (const pos of emptyByQuality) {
    const halfOfPos = isTopHalf(pos) ? 0 : 1;
    const team = secondsLeftFor2b.find(
      (s) =>
        !placedSecondIds2.has(s.team_id) &&
        (groupHalf.get(s.group_order) === undefined || (groupHalf.get(s.group_order) === 0 ? 1 : 0) === halfOfPos)
    );
    if (team) {
      seeded[pos] = team;
      available.delete(pos);
      placedSecondIds2.add(team.team_id);
    }
  }

  // Fase 3: (comentado) 3ros en los huecos que queden — se deja para una siguiente fase
  // for (const team of thirds) {
  //   const pos = pickBestPosition();
  //   if (pos === null) break;
  //   seeded[pos] = team;
  //   available.delete(pos);
  // }

  return seeded;
}

/**
 * Genera los cruces de la primera ronda emparejando mejor seed vs peor seed disponible.
 * Evita que equipos de la misma zona se enfrenten.
 * Usa seeding estándar para asignar las posiciones correctas en el bracket.
 * 
 * @param teamsPlaying Lista de equipos que juegan (ordenados por seed, mejor primero)
 * @param roundName Nombre de la ronda
 * @returns Array de matches con los cruces
 */
function generateFirstRoundMatches(
  teamsPlaying: QualifiedTeam[],
  roundName: string
): PlayoffMatch[] {
  const matches: PlayoffMatch[] = [];
  const numMatches = Math.floor(teamsPlaying.length / 2);
  const numPositions = teamsPlaying.length;
  
  // Generar los cruces: mejor vs peor, segundo mejor vs segundo peor, etc.
  // Pero evitar que equipos de la misma zona se enfrenten
  const matchPairs: Array<{ team1: QualifiedTeam; team2: QualifiedTeam }> = [];
  const usedIndices = new Set<number>();
  
  for (let i = 0; i < numMatches; i++) {
    const team1Index = i; // Mejor seed disponible
    const team1 = teamsPlaying[team1Index];
    
    // Buscar el peor seed disponible que NO sea de la misma zona
    let team2Index = teamsPlaying.length - 1 - i; // Empezar con el peor seed correspondiente
    let team2 = teamsPlaying[team2Index];
    
    // Si son de la misma zona, buscar el siguiente disponible de otra zona
    if (team1.from_group_id === team2.from_group_id) {
      // Buscar desde el final hacia adelante el primer equipo de otra zona que no esté usado
      let found = false;
      for (let j = teamsPlaying.length - 1; j >= numMatches; j--) {
        if (!usedIndices.has(j) && teamsPlaying[j].from_group_id !== team1.from_group_id) {
          team2Index = j;
          team2 = teamsPlaying[team2Index];
          found = true;
          break;
        }
      }
      
      // Si no encontramos uno disponible, buscar desde el principio de los segundos
      if (!found) {
        for (let j = numMatches; j < teamsPlaying.length; j++) {
          if (!usedIndices.has(j) && teamsPlaying[j].from_group_id !== team1.from_group_id) {
            team2Index = j;
            team2 = teamsPlaying[team2Index];
            found = true;
            break;
          }
        }
      }
    }
    
    usedIndices.add(team2Index);
    matchPairs.push({
      team1,
      team2,
    });
  }
  
  // Usar seeding estándar para asignar los matches a las posiciones correctas del bracket
  const seedOrder = getStandardSeedOrder(numPositions);
  
  // Crear matches en las posiciones correctas según el seeding estándar
  const matchesByPosition: Array<{ team1: QualifiedTeam; team2: QualifiedTeam } | null> = 
    new Array(numPositions).fill(null);
  
  // Para cada match pair, encontrar su posición en el bracket usando el seedOrder
  for (let i = 0; i < matchPairs.length; i++) {
    const match = matchPairs[i];
    
    // Encontrar el seed global del mejor equipo del match
    const team1GlobalSeed = teamsPlaying.findIndex(t => t.team_id === match.team1.team_id) + 1; // 1-based
    const team2GlobalSeed = teamsPlaying.findIndex(t => t.team_id === match.team2.team_id) + 1; // 1-based
    const bestSeed = Math.min(team1GlobalSeed, team2GlobalSeed);
    
    // Encontrar la posición en el bracket donde está este seed según el seedOrder
    const position = seedOrder.findIndex(seed => seed === bestSeed);
    if (position !== -1) {
      matchesByPosition[position] = {
        team1: match.team1,
        team2: match.team2,
      };
    }
  }
  
  // Crear los matches finales, asignando bracket_pos secuencialmente (1, 2, 3, 4...)
  // basado en el orden de las posiciones en el bracket (de arriba a abajo)
  // Las posiciones del bracket se emparejan: 0-1, 2-3, 4-5, 6-7
  // Cada par forma un match, y el bracket_pos debe ser secuencial según el orden visual
  
  // Primero, necesitamos identificar qué matches están en qué posiciones
  // y luego agruparlos en pares según el orden visual del bracket
  const matchesWithPosition: Array<{ position: number; team1: QualifiedTeam; team2: QualifiedTeam }> = [];
  
  for (let pos = 0; pos < matchesByPosition.length; pos++) {
    if (matchesByPosition[pos]) {
      matchesWithPosition.push({
        position: pos,
        team1: matchesByPosition[pos]!.team1,
        team2: matchesByPosition[pos]!.team2,
      });
    }
  }
  
  // Ordenar por posición para mantener el orden del bracket
  matchesWithPosition.sort((a, b) => a.position - b.position);
  
  // Ahora agrupar en pares según el orden visual del bracket
  // Para 8 posiciones: pares son (0-1), (2-3), (4-5), (6-7)
  // Cada par forma un match con bracket_pos secuencial
  const finalMatches: Array<{ bracketPos: number; team1: QualifiedTeam; team2: QualifiedTeam }> = [];
  
  for (let pairIndex = 0; pairIndex < numMatches; pairIndex++) {
    const pos1 = pairIndex * 2;
    const pos2 = pairIndex * 2 + 1;
    
    // Buscar el match que está en pos1 o pos2
    const match1 = matchesWithPosition.find(m => m.position === pos1);
    const match2 = matchesWithPosition.find(m => m.position === pos2);
    
    // El match debería estar en una de las dos posiciones del par
    const matchData = match1 || match2;
    
    if (matchData) {
      finalMatches.push({
        bracketPos: pairIndex + 1, // Secuencial: 1, 2, 3, 4...
        team1: matchData.team1,
        team2: matchData.team2,
      });
    }
  }
  
  // Crear los matches finales
  for (const matchPair of finalMatches) {
    matches.push({
      round: roundName,
      bracket_pos: matchPair.bracketPos,
      team1_id: matchPair.team1.team_id,
      team2_id: matchPair.team2.team_id,
      source_team1: null,
      source_team2: null,
    });
  }
  
  // Ordenar por bracket_pos para asegurar el orden correcto
  matches.sort((a, b) => a.bracket_pos - b.bracket_pos);
  
  return matches;
}

/**
 * Calcula la "fuerza del ganador esperado" de un match basándose en los seeds de los equipos.
 * Usa el mejor seed (más fuerte) de los dos equipos, ya que ese será el ganador esperado.
 * 
 * @param match Match de la primera ronda
 * @param rankedTeams Lista completa de equipos ordenados por seed (mejor primero)
 * @returns Un número que representa la fuerza (menor = mejor seed = más fuerte)
 */
function calculateMatchStrength(
  match: PlayoffMatch,
  rankedTeams: QualifiedTeam[]
): number {
  if (!match.team1_id || !match.team2_id) {
    return Infinity; // Matches de bye no se consideran
  }
  
  // Encontrar los índices (seeds) de los equipos en el ranking global
  const team1Index = rankedTeams.findIndex(t => t.team_id === match.team1_id);
  const team2Index = rankedTeams.findIndex(t => t.team_id === match.team2_id);
  
  // Si no encontramos los equipos, retornar un valor alto (débil)
  if (team1Index === -1 || team2Index === -1) {
    return Infinity;
  }
  
  // La "fuerza del ganador esperado" se basa en el MEJOR seed del match
  // Un match con un mejor seed produce un ganador más fuerte
  // Usamos el mínimo de los dos seeds (menor índice = mejor seed = más fuerte)
  return Math.min(team1Index, team2Index);
}

/**
 * Asigna cada seed fuerte al ganador del cruce más débil posible en la siguiente ronda.
 * 
 * @param teamsWithBye Equipos con bye (ordenados por seed, mejor primero)
 * @param firstRoundMatches Matches de la primera ronda (solo matches reales, con ambos equipos)
 * @param rankedTeams Lista completa de equipos ordenados por seed (para calcular fuerza)
 * @param roundName Nombre de la ronda
 * @param nextRoundSize Tamaño de la siguiente ronda
 * @returns Array de matches de la siguiente ronda
 */
function generateNextRoundWithByes(
  teamsWithBye: QualifiedTeam[],
  firstRoundMatches: PlayoffMatch[],
  rankedTeams: QualifiedTeam[],
  roundName: string,
  nextRoundSize: number
): PlayoffMatch[] {
  const matches: PlayoffMatch[] = [];
  const numMatches = Math.floor(nextRoundSize / 2);
  
  // Distribuir los byes en posiciones del bracket usando seeding estándar
  // Esto asegura que los mejores seeds estén en posiciones opuestas
  const seededByes = seedByeTeams(teamsWithBye, nextRoundSize);
  
  // Ordenar los matches de la primera ronda por "fuerza del ganador esperado"
  // El match con el mejor seed más débil produce el ganador más débil
  // Ordenamos de más débil a más fuerte (menor fuerza = más débil)
  const sortedMatches = [...firstRoundMatches].sort((a, b) => {
    const strengthA = calculateMatchStrength(a, rankedTeams);
    const strengthB = calculateMatchStrength(b, rankedTeams);
    return strengthA - strengthB; // Menor fuerza primero (más débil primero)
  });
  
  // Identificar qué posiciones tienen bye y cuáles necesitan ganadores
  const positionsNeedingWinners: number[] = [];
  const positionToByeSeed = new Map<number, number>();
  
  for (let i = 0; i < nextRoundSize; i++) {
    if (!seededByes[i]) {
      positionsNeedingWinners.push(i);
    } else {
      // Guardar el seed del bye en esta posición
      const byeTeam = seededByes[i]!;
      const byeSeed = rankedTeams.findIndex(t => t.team_id === byeTeam.team_id);
      positionToByeSeed.set(i, byeSeed);
    }
  }
  
  // Crear un mapa de posición a "seed del oponente" (el bye en la posición opuesta del par)
  // Las posiciones se emparejan: 0-1, 2-3, 4-5, etc.
  // En cada par, necesitamos saber el seed del bye para asignar el match más débil al mejor seed
  const positionToOpponentSeed = new Map<number, number>();
  for (let i = 0; i < nextRoundSize; i++) {
    if (!seededByes[i]) {
      // Esta posición necesita un ganador, encontrar el seed de su oponente (bye)
      const pairIndex = Math.floor(i / 2);
      const isFirstInPair = i % 2 === 0;
      const opponentPos = isFirstInPair ? i + 1 : i - 1;
      
      if (seededByes[opponentPos]) {
        // El oponente es un bye, encontrar su seed global
        const opponentSeed = positionToByeSeed.get(opponentPos);
        if (opponentSeed !== undefined) {
          positionToOpponentSeed.set(i, opponentSeed);
        }
      }
    }
  }
  
  // Ordenar las posiciones que necesitan ganadores por el seed de su oponente (mejor oponente primero)
  // Esto asegura que los matches más débiles se asignen a las posiciones con mejores oponentes
  positionsNeedingWinners.sort((a, b) => {
    const seedA = positionToOpponentSeed.get(a) ?? Infinity;
    const seedB = positionToOpponentSeed.get(b) ?? Infinity;
    return seedA - seedB; // Menor seed (mejor) primero
  });
  
  // Crear un mapa de posición del bracket a match de primera ronda
  // Asignamos los matches más débiles a las posiciones con mejores oponentes
  // Pero en orden inverso: el match más débil va a la posición con el mejor oponente
  const positionToMatch: Map<number, number> = new Map();
  for (let i = 0; i < positionsNeedingWinners.length; i++) {
    const position = positionsNeedingWinners[i];
    // Asignar en orden inverso: el match más débil (índice 0) va a la posición con el mejor oponente (última en la lista ordenada)
    const matchIndex = positionsNeedingWinners.length - 1 - i;
    if (matchIndex < sortedMatches.length) {
      positionToMatch.set(position, sortedMatches[matchIndex].bracket_pos);
    }
  }
  
  // Generar los matches de la siguiente ronda
  // Emparejamos posiciones consecutivas: 0-1, 2-3, 4-5, etc.
  const prevRoundLabel = firstRoundMatches[0]?.round.charAt(0).toUpperCase() + 
                         firstRoundMatches[0]?.round.slice(1) || "";
  
  for (let i = 0; i < numMatches; i++) {
    const matchNum = i + 1;
    const pos1 = i * 2;
    const pos2 = i * 2 + 1;
    
    const bye1 = seededByes[pos1];
    const bye2 = seededByes[pos2];
    
    let team1Id: number | null = null;
    let team2Id: number | null = null;
    let source1: string | null = null;
    let source2: string | null = null;
    
    if (bye1) {
      team1Id = bye1.team_id;
    } else {
      const matchNum1 = positionToMatch.get(pos1);
      if (matchNum1) {
        source1 = `Ganador ${prevRoundLabel}${matchNum1}`;
      }
    }
    
    if (bye2) {
      team2Id = bye2.team_id;
    } else {
      const matchNum2 = positionToMatch.get(pos2);
      if (matchNum2) {
        source2 = `Ganador ${prevRoundLabel}${matchNum2}`;
      }
    }
    
    matches.push({
      round: roundName,
      bracket_pos: matchNum,
      team1_id: team1Id,
      team2_id: team2Id,
      source_team1: source1,
      source_team2: source2,
    });
  }
  
  return matches;
}

// --- Etapas del bracket (primera ronda con byes) ---
// 1. stageSeedBracketPositions     — Colocar equipos en posiciones (byes + seeds)
// 2. stageClassifyPositions        — Byes, posiciones que necesitan rival, unplaced
// 3. stageBuildGroupHalfMap       — Mitad del bracket por grupo (1ro/2do opuestos)
// 4. stageBuildRealMatchesForFirstRound — Partidos reales respetando zona y mitad
// 5. stageBuildFirstRoundMatchList — Lista de PlayoffMatch de la primera ronda
// 6. stageGenerateSubsequentRounds — Siguiente ronda (con byes) + placeholders
// stageAppendRemainingRoundsPlaceholders — Compartida: semis/final como "Ganador Ronda N"

function getRoundName(size: number): string {
  if (size === 2) return "final";
  if (size === 4) return "semifinal";
  if (size === 8) return "cuartos";
  if (size === 16) return "octavos";
  return "16avos";
}

/** Resultado de clasificar posiciones del bracket (byes, necesitan rival, equipos sin colocar) */
interface ClassifiedPositions {
  positionsWithByes: Array<{ position: number; team: QualifiedTeam }>;
  positionsWithTeamNeedingRival: number[];
  unplacedPlaying: QualifiedTeam[];
}

/** Helpers de mitad del bracket para respetar 1ro/2do en mitades opuestas */
interface GroupHalfMap {
  isTopHalf: (p: number) => boolean;
  requiredHalfForSecond: (groupOrder: number) => number;
}

/** Partido real con posición en el bracket */
interface RealMatchAtPosition {
  team1: QualifiedTeam;
  team2: QualifiedTeam;
  strength: number;
  position: number;
}

/**
 * Etapa 1: Colocar todos los equipos en las posiciones del bracket (byes + seeds).
 * Devuelve el array de posiciones con el equipo asignado o vacío.
 */
function stageSeedBracketPositions(
  rankedTeams: QualifiedTeam[],
  nextRoundSize: number
): (QualifiedTeam | null)[] {
  return seedByeTeams([...rankedTeams], nextRoundSize);
}

/**
 * Etapa 2: Clasificar posiciones en byes, posiciones que necesitan rival,
 * e identificar equipos que juegan pero aún no tienen posición (unplaced).
 */
function stageClassifyPositions(
  nextRoundSeeded: (QualifiedTeam | null)[],
  nextRoundSize: number,
  teamsWithByeList: QualifiedTeam[],
  teamsPlayingInFirstRound: QualifiedTeam[]
): ClassifiedPositions {
  const placedTeamIds = new Set(nextRoundSeeded.filter(Boolean).map((t) => t!.team_id));
  const unplacedPlaying = teamsPlayingInFirstRound.filter((t) => !placedTeamIds.has(t.team_id));
  const positionsWithByes: Array<{ position: number; team: QualifiedTeam }> = [];
  const positionsNeedingWinners: number[] = [];

  for (let i = 0; i < nextRoundSize; i++) {
    const team = nextRoundSeeded[i];
    if (!team) {
      positionsNeedingWinners.push(i);
      continue;
    }
    if (teamsWithByeList.some((t) => t.team_id === team.team_id)) {
      positionsWithByes.push({ position: i, team });
    } else {
      positionsNeedingWinners.push(i);
    }
  }

  const positionsWithTeamNeedingRival = positionsNeedingWinners.filter(
    (pos) => nextRoundSeeded[pos] != null
  );

  return { positionsWithByes, positionsWithTeamNeedingRival, unplacedPlaying };
}

/**
 * Etapa 3: Construir mapa de mitad del bracket por grupo (1ro arriba/abajo)
 * para que los 2dos se asignen en la mitad opuesta a su 1ro.
 */
function stageBuildGroupHalfMap(
  nextRoundSeeded: (QualifiedTeam | null)[],
  nextRoundSize: number
): GroupHalfMap {
  const halfSize = Math.floor(nextRoundSize / 2);
  const isTopHalf = (p: number) => p < halfSize;
  const groupHalfFromSeeded = new Map<number, number>();
  for (let i = 0; i < nextRoundSize; i++) {
    const t = nextRoundSeeded[i];
    if (t?.pos === 1) groupHalfFromSeeded.set(t.group_order, isTopHalf(i) ? 0 : 1);
  }
  const requiredHalfForSecond = (groupOrder: number): number => {
    const half = groupHalfFromSeeded.get(groupOrder) ?? 0;
    return 1 - half;
  };
  return { isTopHalf, requiredHalfForSecond };
}

/**
 * Etapa 4: Formar partidos reales (team1 vs team2) para posiciones que necesitan rival.
 * Respeta: no misma zona y, si team2 es 2do, posición en la mitad opuesta a su 1ro.
 */
function stageBuildRealMatchesForFirstRound(
  positionsWithTeamNeedingRival: number[],
  unplacedPlaying: QualifiedTeam[],
  nextRoundSeeded: (QualifiedTeam | null)[],
  rankedTeams: QualifiedTeam[],
  halfMap: GroupHalfMap
): Map<number, RealMatchAtPosition> {
  const { isTopHalf, requiredHalfForSecond } = halfMap;
  const realMatchesCount = Math.min(positionsWithTeamNeedingRival.length, unplacedPlaying.length);
  const realMatches: RealMatchAtPosition[] = [];
  const usedUnplaced = new Set<number>();

  for (let i = 0; i < realMatchesCount; i++) {
    const pos = positionsWithTeamNeedingRival[i];
    const team1 = nextRoundSeeded[pos]!;
    const posHalf = isTopHalf(pos) ? 0 : 1;

    let team2: QualifiedTeam | null = null;
    let team2Index = -1;
    for (let j = 0; j < unplacedPlaying.length; j++) {
      if (usedUnplaced.has(j)) continue;
      const candidate = unplacedPlaying[j];
      if (candidate.from_group_id === team1.from_group_id) continue;
      if (candidate.pos === 2) {
        const needHalf = requiredHalfForSecond(candidate.group_order);
        if (posHalf !== needHalf) continue;
      }
      if (
        team2 === null ||
        rankedTeams.findIndex((t) => t.team_id === candidate.team_id) >
          rankedTeams.findIndex((t) => t.team_id === team2!.team_id)
      ) {
        team2 = candidate;
        team2Index = j;
      }
    }
    if (team2 === null) {
      for (let j = 0; j < unplacedPlaying.length; j++) {
        if (usedUnplaced.has(j)) continue;
        const candidate = unplacedPlaying[j];
        if (candidate.from_group_id === team1.from_group_id) continue;
        if (candidate.pos === 2) {
          const needHalf = requiredHalfForSecond(candidate.group_order);
          if (posHalf !== needHalf) continue;
        }
        team2 = candidate;
        team2Index = j;
        break;
      }
    }
    if (team2 === null) {
      for (let j = 0; j < unplacedPlaying.length; j++) {
        if (usedUnplaced.has(j)) continue;
        team2 = unplacedPlaying[j];
        team2Index = j;
        break;
      }
    }
    if (team2) {
      usedUnplaced.add(team2Index);
      const strength = Math.min(
        rankedTeams.findIndex((t) => t.team_id === team1.team_id),
        rankedTeams.findIndex((t) => t.team_id === team2.team_id)
      );
      realMatches.push({ team1, team2, strength, position: pos });
    }
  }

  const positionToRealMatch = new Map<number, RealMatchAtPosition>();
  for (const m of realMatches) {
    positionToRealMatch.set(m.position, m);
  }
  return positionToRealMatch;
}

/**
 * Etapa 5: Construir la lista de matches de la primera ronda (byes + partidos reales + huecos).
 */
function stageBuildFirstRoundMatchList(
  firstRoundName: string,
  positionsWithByes: Array<{ position: number; team: QualifiedTeam }>,
  positionToRealMatch: Map<number, RealMatchAtPosition>,
  nextRoundSeeded: (QualifiedTeam | null)[],
  nextRoundSize: number
): PlayoffMatch[] {
  const allMatchData: Array<{ bracketPos: number; team1_id: number | null; team2_id: number | null }> = [];
  for (const { position, team } of positionsWithByes) {
    allMatchData.push({ bracketPos: position + 1, team1_id: team.team_id, team2_id: null });
  }
  positionToRealMatch.forEach((match, position) => {
    allMatchData.push({
      bracketPos: position + 1,
      team1_id: match.team1.team_id,
      team2_id: match.team2.team_id,
    });
  });
  const existingPositions = new Set(allMatchData.map((m) => m.bracketPos));
  for (let i = 0; i < nextRoundSize; i++) {
    if (!existingPositions.has(i + 1)) {
      const team = nextRoundSeeded[i];
      allMatchData.push({
        bracketPos: i + 1,
        team1_id: team?.team_id ?? null,
        team2_id: null,
      });
    }
  }
  allMatchData.sort((a, b) => a.bracketPos - b.bracketPos);

  return allMatchData.map((matchData) => ({
    round: firstRoundName,
    bracket_pos: matchData.bracketPos,
    team1_id: matchData.team1_id,
    team2_id: matchData.team2_id,
    source_team1: null,
    source_team2: null,
  }));
}

/**
 * Etapa 6: Generar matches de la siguiente ronda (con byes) y las rondas restantes (placeholders).
 */
function stageGenerateSubsequentRounds(
  allMatches: PlayoffMatch[],
  firstRoundMatches: PlayoffMatch[],
  teamsWithByeList: QualifiedTeam[],
  rankedTeams: QualifiedTeam[],
  nextRoundSize: number
): void {
  const nextRoundName = getRoundName(nextRoundSize);
  const realMatchesOnly = firstRoundMatches.filter((m) => m.team1_id && m.team2_id);
  const nextRoundMatches = generateNextRoundWithByes(
    teamsWithByeList,
    realMatchesOnly,
    rankedTeams,
    nextRoundName,
    nextRoundSize
  );
  allMatches.push(...nextRoundMatches);

  const numMatchesNextRound = Math.floor(nextRoundSize / 2);
  stageAppendRemainingRoundsPlaceholders(allMatches, numMatchesNextRound, nextRoundName);
}

/**
 * Etapa compartida: agrega las rondas restantes (semis, final) como placeholders
 * "Ganador Ronda N", sin equipos asignados.
 */
function stageAppendRemainingRoundsPlaceholders(
  allMatches: PlayoffMatch[],
  initialRoundNumMatches: number,
  initialRoundName: string
): void {
  let currentRoundSize = initialRoundNumMatches;
  let currentRoundName = initialRoundName;

  while (currentRoundSize > 1) {
    const numMatchesInRound = Math.floor(currentRoundSize / 2);
    const nextRoundNameLabel = getRoundName(currentRoundSize);
    const prevRoundLabel = currentRoundName.charAt(0).toUpperCase() + currentRoundName.slice(1);

    for (let i = 0; i < numMatchesInRound; i++) {
      const matchNum = i + 1;
      const prevMatch1 = i * 2 + 1;
      const prevMatch2 = i * 2 + 2;

      allMatches.push({
        round: nextRoundNameLabel,
        bracket_pos: matchNum,
        team1_id: null,
        team2_id: null,
        source_team1: `Ganador ${prevRoundLabel}${prevMatch1}`,
        source_team2: `Ganador ${prevRoundLabel}${prevMatch2}`,
      });
    }

    currentRoundSize = numMatchesInRound;
    currentRoundName = nextRoundNameLabel;
  }
}

/**
 * Genera todos los matches de playoffs según las reglas del torneo.
 * La lógica se divide en etapas (funciones) que se invocan en orden.
 *
 * @param rankedTeams Equipos ordenados según el ranking global
 * @returns Array de matches de todas las rondas
 */
export function generatePlayoffBracket(rankedTeams: QualifiedTeam[]): PlayoffMatch[] {
  const n = rankedTeams.length;

  if (n < 2) {
    throw new Error("Se necesitan al menos 2 equipos para generar playoffs");
  }

  const { firstRoundName, teamsPlaying, teamsWithBye, nextRoundSize } = calculateFirstRound(n);
  const allMatches: PlayoffMatch[] = [];

  const teamsWithByeList = rankedTeams.slice(0, teamsWithBye);
  const teamsPlayingInFirstRound = rankedTeams.slice(teamsWithBye);

  // Rama: hay byes y equipos que juegan primera ronda
  if (teamsWithBye > 0 && teamsPlaying > 0) {
    const nextRoundSeeded = stageSeedBracketPositions(rankedTeams, nextRoundSize);
    const { positionsWithByes, positionsWithTeamNeedingRival, unplacedPlaying } =
      stageClassifyPositions(
        nextRoundSeeded,
        nextRoundSize,
        teamsWithByeList,
        teamsPlayingInFirstRound
      );
    const halfMap = stageBuildGroupHalfMap(nextRoundSeeded, nextRoundSize);
    const positionToRealMatch = stageBuildRealMatchesForFirstRound(
      positionsWithTeamNeedingRival,
      unplacedPlaying,
      nextRoundSeeded,
      rankedTeams,
      halfMap
    );
    const firstRoundMatches = stageBuildFirstRoundMatchList(
      firstRoundName,
      positionsWithByes,
      positionToRealMatch,
      nextRoundSeeded,
      nextRoundSize
    );
    allMatches.push(...firstRoundMatches);
    stageGenerateSubsequentRounds(
      allMatches,
      firstRoundMatches,
      teamsWithByeList,
      rankedTeams,
      nextRoundSize
    );
  } else if (teamsPlaying > 0) {
    // Rama: no hay byes, todos juegan la primera ronda
    const firstRoundMatches = generateFirstRoundMatches(teamsPlayingInFirstRound, firstRoundName);
    allMatches.push(...firstRoundMatches);
    stageAppendRemainingRoundsPlaceholders(allMatches, firstRoundMatches.length, firstRoundName);
  } else {
    // Rama: todos tienen bye, primera ronda es la siguiente (cuartos/semis según tamaño)
    const nextRoundName = getRoundName(nextRoundSize);
    const seededByes = seedByeTeams(teamsWithByeList, nextRoundSize);
    const numMatches = Math.floor(nextRoundSize / 2);

    for (let i = 0; i < numMatches; i++) {
      const matchNum = i + 1;
      const pos1 = i * 2;
      const pos2 = i * 2 + 1;
      const team1 = seededByes[pos1];
      const team2 = seededByes[pos2];

      allMatches.push({
        round: nextRoundName,
        bracket_pos: matchNum,
        team1_id: team1?.team_id || null,
        team2_id: team2?.team_id || null,
        source_team1: null,
        source_team2: null,
      });
    }

    stageAppendRemainingRoundsPlaceholders(allMatches, numMatches, nextRoundName);
  }

  return allMatches;
}

/**
 * Función principal que genera el bracket completo de playoffs.
 * 
 * @param qualifiedTeams Equipos clasificados con su posición y grupo
 * @param groupOrderMap Mapa de group_id -> group_order
 * @returns Array de matches de todas las rondas
 */
export function generatePlayoffs(
  qualifiedTeams: Array<{ team_id: number; from_group_id: number; pos: number }>,
  groupOrderMap: Map<number, number>
): PlayoffMatch[] {
  // Agregar group_order a cada equipo
  const teamsWithOrder: QualifiedTeam[] = qualifiedTeams.map(t => ({
    ...t,
    group_order: groupOrderMap.get(t.from_group_id) ?? 999,
  }));

  // Construir ranking global
  const rankedTeams = buildGlobalRanking(teamsWithOrder);

  // Generar bracket
  return generatePlayoffBracket(rankedTeams);
}

