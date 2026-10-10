import type { Page, Locator } from "playwright";
import type { LocatorGroup, LocatorCandidate } from "@rpa/dsl";

export interface ResolvedLocator {
  locator: Locator;
  strategy: string;
  value: string;
}

export async function resolveLocator(
  page: Page,
  group: LocatorGroup,
  timeoutMs = 5000
): Promise<ResolvedLocator> {
  const candidates: LocatorCandidate[] = [
    group.primary,
    ...(group.fallbacks || []),
  ];

  const failedAttempts: string[] = [];

  for (const candidate of candidates) {
    try {
      const loc = createPlaywrightLocator(page, candidate);
      // Auto-wait: verificar que el elemento sea visible dentro del timeout acotado por intento
      await loc.first().waitFor({ state: "visible", timeout: Math.min(timeoutMs, 2500) });
      return {
        locator: loc.first(),
        strategy: candidate.strategy,
        value: candidate.value,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failedAttempts.push(`[${candidate.strategy}: '${candidate.value}' (${msg})]`);
    }
  }

  throw new Error(
    `No se pudo resolver el elemento con ningún localizador disponible. Intentos: ${failedAttempts.join(", ")}`
  );
}

function createPlaywrightLocator(page: Page, candidate: LocatorCandidate): Locator {
  switch (candidate.strategy) {
    case "testid":
      return page.getByTestId(candidate.value);
    case "text":
      return page.getByText(candidate.value, { exact: false });
    case "label":
      return page.getByLabel(candidate.value);
    case "role": {
      // Formato: "button[name='Texto']" o "button"
      const match = candidate.value.match(/^([a-z]+)(\[name=['"](.*)['"]\])?$/i);
      if (match) {
        const role = match[1] as any;
        const name = match[3];
        return name ? page.getByRole(role, { name }) : page.getByRole(role);
      }
      return page.locator(candidate.value);
    }
    case "css":
    case "xpath":
    default:
      return page.locator(candidate.value);
  }
}
