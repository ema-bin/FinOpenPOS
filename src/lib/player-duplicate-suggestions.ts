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

const SUGGESTION_THRESHOLD = 0.72;
const MAX_SUGGESTIONS = 5;

export function normalizePlayerText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePlayerPhone(value: string): string {
  return value.replace(/\D/g, "");
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

function textSimilarity(a: string, b: string): number {
  const left = normalizePlayerText(a);
  const right = normalizePlayerText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return 0;
  const distance = levenshteinDistance(left, right);
  return 1 - distance / maxLen;
}

function tokenSetSimilarity(a: string, b: string): number {
  const left = normalizePlayerText(a).split(" ").filter(Boolean).sort().join(" ");
  const right = normalizePlayerText(b).split(" ").filter(Boolean).sort().join(" ");
  if (!left || !right) return 0;
  return textSimilarity(left, right);
}

function scorePhone(inputPhone: string, candidatePhone: string | null): {
  score: number;
  reason: string | null;
} {
  const left = normalizePlayerPhone(inputPhone);
  const right = normalizePlayerPhone(candidatePhone ?? "");
  if (!left || !right) return { score: 0, reason: null };
  if (left === right) return { score: 1, reason: "Mismo teléfono" };

  const suffixLen = 8;
  const leftSuffix = left.slice(-suffixLen);
  const rightSuffix = right.slice(-suffixLen);
  if (
    leftSuffix.length >= suffixLen &&
    rightSuffix.length >= suffixLen &&
    leftSuffix === rightSuffix
  ) {
    return { score: 0.92, reason: "Teléfono muy similar (últimos 8 dígitos)" };
  }

  if (left.includes(right) || right.includes(left)) {
    return { score: 0.84, reason: "Teléfono parecido" };
  }

  const similarity = textSimilarity(left, right);
  if (similarity >= 0.8) {
    return { score: similarity, reason: "Teléfono parecido" };
  }

  return { score: similarity, reason: null };
}

export function hasEnoughDuplicateCheckInput(input: PlayerDuplicateInput): boolean {
  const phoneDigits = normalizePlayerPhone(input.phone);
  const first = normalizePlayerText(input.first_name);
  const last = normalizePlayerText(input.last_name);
  return phoneDigits.length >= 6 || (first.length >= 2 && last.length >= 2);
}

export function scorePlayerDuplicate(
  input: PlayerDuplicateInput,
  candidate: PlayerDuplicateCandidate
): PlayerDuplicateSuggestion | null {
  const reasons: string[] = [];
  let score = 0;

  const phone = scorePhone(input.phone, candidate.phone);
  if (phone.reason) {
    reasons.push(phone.reason);
    score = Math.max(score, phone.score);
  }

  const firstSim = textSimilarity(input.first_name, candidate.first_name);
  const lastSim = textSimilarity(input.last_name, candidate.last_name);
  const fullInput = `${input.first_name} ${input.last_name}`.trim();
  const fullCandidate = `${candidate.first_name} ${candidate.last_name}`.trim();
  const fullSim = Math.max(
    textSimilarity(fullInput, fullCandidate),
    tokenSetSimilarity(fullInput, fullCandidate)
  );

  const nameScore = firstSim * 0.35 + lastSim * 0.45 + fullSim * 0.2;
  score = Math.max(score, nameScore);

  if (firstSim >= 0.88) reasons.push("Nombre muy similar");
  if (lastSim >= 0.88) reasons.push("Apellido muy similar");
  if (fullSim >= 0.9 && firstSim < 0.88 && lastSim < 0.88) {
    reasons.push("Nombre completo parecido");
  }
  if (firstSim >= 0.95 && lastSim >= 0.75) {
    reasons.push("Nombre y apellido parecidos");
  }

  const uniqueReasons = Array.from(new Set(reasons));
  if (score < SUGGESTION_THRESHOLD) return null;

  return {
    player: candidate,
    score,
    reasons: uniqueReasons.length > 0 ? uniqueReasons : ["Datos parecidos"],
  };
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
