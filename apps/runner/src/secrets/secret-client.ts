import { createHmac, randomBytes } from "node:crypto";

export interface SecretClientOptions {
  baseUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
  timeoutMs?: number;
}

export class SecretResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretResolutionError";
  }
}

/**
 * Cliente del endpoint interno de Laravel. Envía solo referencias y una firma
 * HMAC de corta duración; nunca recibe secretos por Redis.
 */
export class SecretClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly nonce: () => string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, Record<string, string>>();

  constructor(options: SecretClientOptions = {}) {
    const fallbackPort = process.env.APP_PORT || "8000";
    this.baseUrl = (
      options.baseUrl ??
      process.env.RPA_INTERNAL_URL ??
      process.env.API_INTERNAL_URL ??
      `http://127.0.0.1:${fallbackPort}`
    ).replace(/\/+$/, "");
    this.secret = options.secret ?? process.env.RPA_INTERNAL_SECRET ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.nonce = options.nonce ?? (() => randomBytes(16).toString("hex"));
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async fetchSecrets(runId: string, refs: string[]): Promise<Record<string, string>> {
    if (refs.length === 0) {
      return {};
    }

    if (this.secret === "") {
      throw new SecretResolutionError(
        "RPA_INTERNAL_SECRET no está configurado; el runner no puede resolver secretos."
      );
    }

    const cached = this.cache.get(runId);
    if (cached && refs.every((ref) => ref in cached)) {
      return this.pick(cached, refs);
    }

    const timestamp = Math.floor(this.now() / 1000).toString();
    const nonce = this.nonce();
    const signature = createHmac("sha256", this.secret)
      .update(`${runId}|${timestamp}|${nonce}`)
      .digest("hex");

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/internal/v1/runs/${encodeURIComponent(runId)}/secrets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RPA-Timestamp": timestamp,
          "X-RPA-Nonce": nonce,
          "X-RPA-Signature": signature,
        },
        body: JSON.stringify({ refs }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new SecretResolutionError(
        `No se pudo contactar el endpoint interno de secretos: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!response.ok) {
      throw new SecretResolutionError(`El endpoint interno de secretos respondió HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as { secrets?: Record<string, unknown> };
    const resolved: Record<string, string> = {};

    for (const [key, value] of Object.entries(payload.secrets ?? {})) {
      if (typeof value === "string") {
        resolved[key] = value;
      }
    }

    const missing = refs.filter((ref) => !(ref in resolved));
    if (missing.length > 0) {
      // Solo se exponen las claves, jamás los valores.
      throw new SecretResolutionError(
        `El workspace no tiene los secretos requeridos: ${missing.sort().join(", ")}`
      );
    }

    const merged = { ...(cached ?? {}), ...resolved };
    this.cache.set(runId, merged);

    return this.pick(merged, refs);
  }

  clear(runId: string): void {
    this.cache.delete(runId);
  }

  clearAll(): void {
    this.cache.clear();
  }

  private pick(secrets: Record<string, string>, refs: string[]): Record<string, string> {
    const picked: Record<string, string> = {};
    for (const ref of refs) {
      if (ref in secrets) {
        picked[ref] = secrets[ref];
      }
    }
    return picked;
  }
}
