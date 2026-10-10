import { describe, it, expect } from "vitest";
import { calculateLocatorScore, sortCandidatesByScore } from "../src/scoring.js";
import { calculateFingerprintSimilarity } from "../src/fingerprint.js";

describe("Locator Scoring & Fingerprint", () => {
  it("prioriza testid sobre CSS común y penaliza nth-child", () => {
    const testidScore = calculateLocatorScore("testid", "submit-btn");
    const roleScore = calculateLocatorScore("role", "button[name='Enviar']");
    const cssNthScore = calculateLocatorScore("css", "div:nth-child(3) > button");

    expect(testidScore).toBe(95);
    expect(roleScore).toBe(90);
    expect(cssNthScore).toBe(50); // 70 base - 20 penalización

    const sorted = sortCandidatesByScore([
      { strategy: "css", value: "div:nth-child(3) > button", score: cssNthScore },
      { strategy: "testid", value: "submit-btn", score: testidScore },
      { strategy: "role", value: "button[name='Enviar']", score: roleScore },
    ]);

    expect(sorted[0].strategy).toBe("testid");
    expect(sorted[1].strategy).toBe("role");
    expect(sorted[2].strategy).toBe("css");
  });

  it("calcula similitud alta entre elementos equivalentes", () => {
    const original = {
      role: "button",
      accessibleName: "Iniciar sesión",
      tag: "button",
      classes: ["btn", "btn-primary"],
    };
    const modified = {
      role: "button",
      accessibleName: "Iniciar sesión",
      tag: "button",
      classes: ["btn", "btn-primary", "new-theme-class"],
    };

    const similarity = calculateFingerprintSimilarity(original, modified);
    expect(similarity).toBeGreaterThan(0.8);
  });
});
