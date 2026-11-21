const PROXY_HOSTILE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "accounts.google.com",
  "netflix.com",
  "twitch.tv",
  "disneyplus.com",
  "primevideo.com",
];

/**
 * Detecta si una URL o host pertenece a un servicio conocido por
 * restringir activamente la reproducción de video o scripts en iframes/proxies
 * (ej. tokens PO de YouTube, DRM EME estricto, BotGuard).
 */
export function isProxyHostileHost(urlOrHost: string): boolean {
  if (!urlOrHost || typeof urlOrHost !== "string") return false;
  let hostname = urlOrHost.trim().toLowerCase();

  try {
    if (hostname.includes("://")) {
      hostname = new URL(hostname).hostname.toLowerCase();
    } else {
      hostname = hostname.split("/")[0].split(":")[0].trim();
    }
  } catch {
    return false;
  }

  // Quitar prefijo www. si existe
  const baseHost = hostname.startsWith("www.") ? hostname.slice(4) : hostname;

  return PROXY_HOSTILE_DOMAINS.some(
    (domain) => baseHost === domain || baseHost.endsWith(`.${domain}`)
  );
}
