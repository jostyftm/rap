export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  }
  return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export function buildWebhookUrl(path: string | undefined): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const cleanPath = (path || "").trim();
  const leading = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${base}${leading}`;
}
