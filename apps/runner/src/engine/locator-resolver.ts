import type { Page, Locator } from "playwright";
import type { LocatorGroup, LocatorCandidate } from "@rpa/dsl";

export interface ResolvedLocator {
  locator: Locator;
  strategy: string;
  value: string;
}

const DEFAULT_LOCATOR_TIMEOUT_MS = 10000;

function isTimeoutError(err: unknown, message: string): boolean {
  if (err instanceof Error && err.name === "TimeoutError") {
    return true;
  }
  return /Timeout\s+\d+ms\s+exceeded/i.test(message);
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_LOCATOR_TIMEOUT_MS;
}

export async function resolveLocator(
  page: Page,
  group: LocatorGroup,
  timeoutMs?: number
): Promise<ResolvedLocator> {
  const effectiveTimeout = normalizeTimeoutMs(timeoutMs);
  const candidates: LocatorCandidate[] = [
    group.primary,
    ...(group.fallbacks || []),
  ].filter(
    (c): c is LocatorCandidate =>
      Boolean(c && typeof c.value === "string" && c.value.trim().length > 0)
  );

  if (candidates.length === 0) {
    throw new Error(
      `No se pudo resolver el elemento: el grupo de localizadores está vacío (timeout: ${effectiveTimeout}ms).`
    );
  }

  // Comprobación rápida en orden de prioridad cuando hay múltiples candidatos
  if (candidates.length > 1) {
    for (const candidate of candidates) {
      try {
        const firstLoc = createPlaywrightLocator(page, candidate).first();
        if (typeof (firstLoc as any).isVisible === "function") {
          const visible = await firstLoc.isVisible().catch(() => false);
          if (visible) {
            return {
              locator: firstLoc,
              strategy: candidate.strategy,
              value: candidate.value,
            };
          }
        }
      } catch {
        // Ignorar errores puntuales durante comprobación rápida
      }
    }
  }

  const deadline = Date.now() + effectiveTimeout;
  const lastErrors = new Map<number, string>();
  const nonRetryable = new Set<number>();

  while (Date.now() < deadline) {
    const viableIndices = candidates
      .map((_, idx) => idx)
      .filter((idx) => !nonRetryable.has(idx));

    if (viableIndices.length === 0) {
      break;
    }

    if (viableIndices.length === 1) {
      const idx = viableIndices[0];
      const candidate = candidates[idx];
      const remaining = Math.max(1, deadline - Date.now());
      try {
        const firstLoc = createPlaywrightLocator(page, candidate).first();
        await firstLoc.waitFor({ state: "visible", timeout: remaining });
        return {
          locator: firstLoc,
          strategy: candidate.strategy,
          value: candidate.value,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastErrors.set(idx, `[${candidate.strategy}: '${candidate.value}' (${msg})]`);
        break;
      }
    }

    for (const idx of viableIndices) {
      const leftMs = deadline - Date.now();
      if (leftMs <= 0) break;

      const candidate = candidates[idx];
      const activeCount = candidates.length - nonRetryable.size;
      const sliceMs = Math.min(
        leftMs,
        Math.max(500, Math.min(2500, Math.ceil(leftMs / Math.max(1, activeCount))))
      );
      const attemptStart = Date.now();

      try {
        const firstLoc = createPlaywrightLocator(page, candidate).first();
        await firstLoc.waitFor({ state: "visible", timeout: sliceMs });
        return {
          locator: firstLoc,
          strategy: candidate.strategy,
          value: candidate.value,
        };
      } catch (err: unknown) {
        const elapsed = Date.now() - attemptStart;
        const msg = err instanceof Error ? err.message : String(err);
        lastErrors.set(idx, `[${candidate.strategy}: '${candidate.value}' (${msg})]`);

        if (!isTimeoutError(err, msg) || (elapsed < 50 && sliceMs >= 100)) {
          nonRetryable.add(idx);
        }
      }
    }
  }

  const failedAttempts = candidates.map(
    (c, idx) =>
      lastErrors.get(idx) ?? `[${c.strategy}: '${c.value}' (no alcanzó a evaluarse dentro de ${effectiveTimeout}ms)]`
  );

  throw new Error(
    `No se pudo resolver el elemento con ningún localizador disponible (timeout: ${effectiveTimeout}ms). Intentos: ${failedAttempts.join(", ")}`
  );
}

export function createPlaywrightLocator(page: Page, candidate: LocatorCandidate): Locator {
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
    case "xpath": {
      const raw = candidate.value.trim();
      return page.locator(raw.startsWith("xpath=") ? raw : `xpath=${raw}`);
    }
    case "css":
    default:
      return page.locator(candidate.value);
  }
}
