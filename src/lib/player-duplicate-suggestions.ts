export type PlayerDuplicateCandidate = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
  city: string | null;
};

export type PlayerDuplicateInput = {
  first_name: string;
  last_name: string;
  phone: string;
};

export type PlayerDuplicateSuggestion = {
  player: PlayerDuplicateCandidate;
  score: number;
  reasons: string[];
};

const MAX_SUGGESTIONS = 5;
const MIN_PHONE_DIGITS = 8;
const MIN_NAME_PART_LENGTH = 2;

export function normalizePlayerText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Solo dígitos del teléfono ingresado o almacenado. */
export function normalizePlayerPhone(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formato comparable para teléfonos (p. ej. +54 9 11… vs 11…).
 * Quita prefijo país, cero inicial y el 9 de móvil argentino cuando aplica.
 */
export function canonicalPlayerPhone(value: string): string {
  let digits = normalizePlayerPhone(value);
  if (!digits) return "";

  digits = digits.replace(/^0+/, "");

  if (digits.startsWith("54")) {
    digits = digits.slice(2);
  }

  if (digits.length >= 11 && digits.startsWith("9")) {
    digits = digits.slice(1);
  }

  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  return digits;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const len1 = a.length;
  const len2 = b.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || a[i] !== b[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

function jaroWinklerSimilarity(a: string, b: string): number {
  const jaro = jaroSimilarity(a, b);
  let prefix = 0;
  for (let i = 0; i < Math.min(a.length, b.length, 4); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Typos de 1–2 letras en apellidos/nombres largos (Baglioni/Bagloni). */
function isLikelyTypo(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 5) return false;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  const maxDistance = maxLen >= 8 ? 2 : 1;
  return distance <= maxDistance && distance / maxLen <= 0.25;
}

function namePartSimilarity(a: string, b: string): number {
  const left = normalizePlayerText(a);
  const right = normalizePlayerText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const minLen = Math.min(left.length, right.length);
  if (minLen <= 3) {
    return left === right ? 1 : 0;
  }

  if (isLikelyTypo(left, right)) {
    return 0.94;
  }

  return jaroWinklerSimilarity(left, right);
}

function tokenSetKey(value: string): string {
  return normalizePlayerText(value).split(" ").filter(Boolean).sort().join(" ");
}

function phonesMatchExactly(inputPhone: string, candidatePhone: string | null): boolean {
  const left = canonicalPlayerPhone(inputPhone);
  const right = canonicalPlayerPhone(candidatePhone ?? "");
  if (!left || !right) return false;
  if (left.length < MIN_PHONE_DIGITS || right.length < MIN_PHONE_DIGITS) return false;
  return left === right;
}

function scoreNameMatch(
  input: PlayerDuplicateInput,
  candidate: PlayerDuplicateCandidate
): PlayerDuplicateSuggestion | null {
  const firstA = normalizePlayerText(input.first_name);
  const lastA = normalizePlayerText(input.last_name);
  const firstB = normalizePlayerText(candidate.first_name);
  const lastB = normalizePlayerText(candidate.last_name);

  if (
    firstA.length < MIN_NAME_PART_LENGTH ||
    lastA.length < MIN_NAME_PART_LENGTH ||
    !firstB ||
    !lastB
  ) {
    return null;
  }

  const reasons: string[] = [];

  if (firstA === firstB && lastA === lastB) {
    reasons.push("Mismo nombre y apellido");
    return {
      player: candidate,
      score: 0.98,
      reasons,
    };
  }

  const fullA = tokenSetKey(`${input.first_name} ${input.last_name}`);
  const fullB = tokenSetKey(`${candidate.first_name} ${candidate.last_name}`);
  if (fullA === fullB) {
    reasons.push("Mismo nombre completo");
    return {
      player: candidate,
      score: 0.96,
      reasons,
    };
  }

  const firstSim = namePartSimilarity(firstA, firstB);
  const lastSim = namePartSimilarity(lastA, lastB);
  const minLastLen = Math.min(lastA.length, lastB.length);

  if (firstA === firstB && firstA.length >= 3 && minLastLen >= 5) {
    if (lastSim >= 0.88 || isLikelyTypo(lastA, lastB)) {
      reasons.push("Nombre igual", "Apellido muy similar");
      return {
        player: candidate,
        score: 0.9 + lastSim * 0.08,
        reasons,
      };
    }
  }

  if (lastA === lastB && lastA.length >= 5 && firstSim >= 0.92) {
    reasons.push("Apellido igual", "Nombre muy similar");
    return {
      player: candidate,
      score: 0.9 + firstSim * 0.08,
      reasons,
    };
  }

  if (
    minLastLen >= 5 &&
    firstA.length >= 3 &&
    firstB.length >= 3 &&
    firstSim >= 0.9 &&
    lastSim >= 0.88
  ) {
    reasons.push("Nombre muy similar", "Apellido muy similar");
    return {
      player: candidate,
      score: firstSim * 0.35 + lastSim * 0.65,
      reasons,
    };
  }

  return null;
}

export function hasEnoughDuplicateCheckInput(input: PlayerDuplicateInput): boolean {
  const phoneDigits = normalizePlayerPhone(input.phone);
  const first = normalizePlayerText(input.first_name);
  const last = normalizePlayerText(input.last_name);
  return phoneDigits.length >= MIN_PHONE_DIGITS || (first.length >= 2 && last.length >= 2);
}

export function scorePlayerDuplicate(
  input: PlayerDuplicateInput,
  candidate: PlayerDuplicateCandidate
): PlayerDuplicateSuggestion | null {
  if (phonesMatchExactly(input.phone, candidate.phone)) {
    return {
      player: candidate,
      score: 1,
      reasons: ["Mismo teléfono"],
    };
  }

  return scoreNameMatch(input, candidate);
}

export function findPlayerDuplicateSuggestions(
  input: PlayerDuplicateInput,
  candidates: PlayerDuplicateCandidate[],
  options?: { excludePlayerId?: number | null }
): PlayerDuplicateSuggestion[] {
  const excludeId = options?.excludePlayerId ?? null;
  if (!hasEnoughDuplicateCheckInput(input)) return [];

  return candidates
    .filter((candidate) => candidate.id !== excludeId)
    .map((candidate) => scorePlayerDuplicate(input, candidate))
    .filter((item): item is PlayerDuplicateSuggestion => item != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);
}
