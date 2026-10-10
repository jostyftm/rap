import type { LocatorStrategy, LocatorCandidate } from "@rpa/dsl";

const BASE_STRATEGY_SCORES: Record<LocatorStrategy, number> = {
  testid: 95,
  role: 90,
  label: 85,
  text: 80,
  css: 70,
  xpath: 50,
  vision: 40,
};

export function calculateLocatorScore(
  strategy: LocatorStrategy,
  value: string
): number {
  let score = BASE_STRATEGY_SCORES[strategy] ?? 50;

  // Penalización por nth-child o índices de posición
  if (value.includes(":nth-child") || value.includes(":nth-of-type")) {
    score -= 20;
  }

  // Penalización por IDs autogenerados o numéricos
  if (
    strategy === "css" &&
    (/#.*[0-9]{4,}/.test(value) || /#(ember|react|vue|ng)-?[0-9]+/i.test(value))
  ) {
    score -= 25;
  }

  // Penalización por clases ofuscadas / hash
  if (
    strategy === "css" &&
    /\.[a-zA-Z0-9_-]*[a-f0-9]{7,}[a-zA-Z0-9_-]*/.test(value)
  ) {
    score -= 25;
  }

  // Penalización por XPath con rutas absolutas o anidamientos profundos
  if (strategy === "xpath") {
    if (value.startsWith("//html") || value.startsWith("/html")) {
      score -= 30;
    }
    const slashCount = (value.match(/\//g) || []).length;
    if (slashCount > 4) {
      score -= 15;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function sortCandidatesByScore(
  candidates: LocatorCandidate[]
): LocatorCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}
