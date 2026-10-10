import type { SemanticFingerprint } from "@rpa/dsl";

export function calculateFingerprintSimilarity(
  a: SemanticFingerprint,
  b: SemanticFingerprint
): number {
  let score = 0;

  // 1. Rol ARIA (35%)
  if (a.role && b.role) {
    if (a.role.toLowerCase() === b.role.toLowerCase()) {
      score += 0.35;
    }
  }

  // 2. Nombre accesible / Texto visible (35%)
  const textA = (a.accessibleName || a.text || "").trim().toLowerCase();
  const textB = (b.accessibleName || b.text || "").trim().toLowerCase();
  if (textA && textB) {
    if (textA === textB) {
      score += 0.35;
    } else if (textA.includes(textB) || textB.includes(textA)) {
      score += 0.2;
    }
  }

  // 3. Tag HTML (15%)
  if (a.tag && b.tag && a.tag.toUpperCase() === b.tag.toUpperCase()) {
    score += 0.15;
  }

  // 4. Clases CSS compartidas (15%)
  if (a.classes && b.classes && a.classes.length > 0 && b.classes.length > 0) {
    const setB = new Set(b.classes);
    const shared = a.classes.filter((c) => setB.has(c));
    if (shared.length > 0) {
      score += Math.min(0.15, (shared.length / a.classes.length) * 0.15);
    }
  }

  return Math.min(1.0, Math.max(0.0, score));
}
