export const PRODUCTION_WEBHOOK_PREFIX = "/api/v1/webhooks";
export const TEST_WEBHOOK_PREFIX = "/api/v1/webhooks-test";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  }
  return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export function extractWebhookSlug(rawPath: string | undefined, fallbackId = "webhook"): string {
  const trimmed = (rawPath || "").trim().replace(/^\/+|\/+$/g, "");
  const stripped = trimmed.replace(/^(?:api\/v1\/)?(?:webhooks-test|webhooks)(?:\/|$)/i, "");
  const slug = stripped.replace(/^\/+|\/+$/g, "");
  if (slug) return slug;
  const fb = (fallbackId || "webhook").replace(/^\/+|\/+$/g, "");
  return fb || "webhook";
}

export function buildProductionWebhookPath(path: string | undefined, fallbackId?: string): string {
  return `${PRODUCTION_WEBHOOK_PREFIX}/${extractWebhookSlug(path, fallbackId)}`;
}

export function buildTestWebhookPath(path: string | undefined, fallbackId?: string): string {
  return `${TEST_WEBHOOK_PREFIX}/${extractWebhookSlug(path, fallbackId)}`;
}

export function buildProductionWebhookUrl(path: string | undefined, fallbackId?: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  return `${base}${buildProductionWebhookPath(path, fallbackId)}`;
}

export function buildTestWebhookUrl(path: string | undefined, fallbackId?: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  return `${base}${buildTestWebhookPath(path, fallbackId)}`;
}

export function buildWebhookUrl(path: string | undefined): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const cleanPath = (path || "").trim();
  const leading = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${base}${leading}`;
}
