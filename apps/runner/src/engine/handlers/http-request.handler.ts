import type { Page } from "playwright";
import type { HttpRequestNode, HttpResponseType } from "@rpa/dsl";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter, resolveSingleTokenValue } from "./token-warnings.js";
import type { ActionResult, ExecutionContext, NodeActionHandler } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = Math.max(
  64 * 1024,
  Number(process.env.RPA_HTTP_MAX_RESPONSE_BYTES ?? 10 * 1024 * 1024)
);

function parseHttpHostAliases(raw?: string): Map<string, string> {
  const aliases = new Map<string, string>();
  if (!raw) return aliases;

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const source = trimmed.slice(0, eqIdx).trim().toLowerCase();
    const target = trimmed.slice(eqIdx + 1).trim();
    if (source && target) {
      aliases.set(source, target);
    }
  }
  return aliases;
}

function applyHttpHostAlias(url: URL, rawAliases?: string): URL {
  const aliases = parseHttpHostAliases(rawAliases);
  if (aliases.size === 0) return url;

  const target =
    aliases.get(url.host.toLowerCase()) ?? aliases.get(url.hostname.toLowerCase());
  if (!target) return url;

  if (/^https?:\/\//i.test(target)) {
    try {
      const targetUrl = new URL(target);
      url.protocol = targetUrl.protocol;
      url.host = targetUrl.host;
    } catch {
      // Ignorar alias con formato de URL inválido
    }
  } else {
    url.host = target;
  }

  return url;
}

function formatFetchError(err: unknown, targetUrl: string): Error {
  const baseMessage = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;

  if (cause && typeof cause === "object") {
    const c = cause as {
      code?: unknown;
      hostname?: unknown;
      address?: unknown;
      port?: unknown;
      message?: unknown;
    };
    const parts: string[] = [];
    if (typeof c.code === "string" && c.code) parts.push(c.code);
    if (typeof c.hostname === "string" && c.hostname) parts.push(c.hostname);
    if (typeof c.address === "string" && c.address) {
      parts.push(c.port !== undefined ? `${c.address}:${c.port}` : c.address);
    }
    if (parts.length > 0) {
      return new Error(`${baseMessage} (${parts.join(" ")}) [${targetUrl}]`);
    }
    if (typeof c.message === "string" && c.message) {
      return new Error(`${baseMessage} (${c.message}) [${targetUrl}]`);
    }
  }

  return err instanceof Error ? err : new Error(baseMessage);
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;
  const [, a, b] = ipv4Match.map(Number);
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function findHeaderIgnoreCase(headers: Record<string, string>, targetKey: string): string | undefined {
  const lower = targetKey.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return key;
    }
  }
  return undefined;
}

function setHeaderIfAbsent(
  headers: Record<string, string>,
  key: string,
  value: string
): void {
  if (!findHeaderIgnoreCase(headers, key)) {
    headers[key] = value;
  }
}

function parseFilenameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      return utf8Match[1].trim();
    }
  }
  const regularMatch = disposition.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  const raw = regularMatch?.[1] ?? regularMatch?.[2];
  return raw ? raw.trim().replace(/^["']|["']$/g, "") : undefined;
}

function detectAutoResponseType(contentType: string): Exclude<HttpResponseType, "auto"> {
  const lower = contentType.toLowerCase();
  if (lower.includes("application/json") || lower.includes("+json")) {
    return "json";
  }
  if (lower.includes("application/xml") || lower.includes("text/xml") || lower.includes("+xml")) {
    return "xml";
  }
  if (
    lower.startsWith("text/") ||
    lower.includes("application/javascript") ||
    lower.includes("application/x-www-form-urlencoded")
  ) {
    return "text";
  }
  return "binary";
}

function extractBinaryFromValue(
  raw: unknown
): { buffer: Buffer; contentType?: string; filename?: string } | null {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "base64" in raw &&
    typeof (raw as { base64?: unknown }).base64 === "string"
  ) {
    const obj = raw as { base64: string; contentType?: string; filename?: string };
    const clean = obj.base64.replace(/^data:[^;]+;base64,/, "");
    return {
      buffer: Buffer.from(clean, "base64"),
      contentType: obj.contentType,
      filename: obj.filename,
    };
  }
  return null;
}

export const httpRequestHandler: NodeActionHandler<HttpRequestNode> = {
  type: "httpRequest",
  async execute(
    _page: Page,
    node: HttpRequestNode,
    ctx: ExecutionContext
  ): Promise<ActionResult> {
    const startedAt = Date.now();
    const onMissingTokens = createMissingTokenReporter(node.id, node.type, ctx);
    const interpolate = (value: string) =>
      interpolateString(value, ctx.variables, ctx.secrets, { onMissingTokens });

    const method = (node.params.method || "GET").toUpperCase();
    let resolvedUrl = interpolate(node.params.url || "").trim();

    for (const pathParam of node.params.pathParams || []) {
      if (pathParam.enabled === false) continue;
      const key = pathParam.key.trim();
      if (!key) continue;
      const val = encodeURIComponent(interpolate(pathParam.value ?? ""));
      resolvedUrl = resolvedUrl
        .replaceAll(`:${key}`, val)
        .replaceAll(`{${key}}`, val);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(resolvedUrl);
    } catch {
      throw new Error(`URL inválida en petición HTTP '${node.id}': ${resolvedUrl}`);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(`Protocolo no permitido en '${node.id}': ${parsedUrl.protocol}`);
    }

    applyHttpHostAlias(parsedUrl, process.env.RPA_HTTP_HOST_ALIASES);

    if (
      process.env.RPA_HTTP_ALLOW_PRIVATE_NETWORKS === "false" &&
      isPrivateOrLocalHostname(parsedUrl.hostname)
    ) {
      throw new Error(
        `Acceso bloqueado a red privada o local (${parsedUrl.hostname}) por política SSRF`
      );
    }

    for (const q of node.params.queryParams || []) {
      if (q.enabled === false) continue;
      const key = q.key.trim();
      if (!key) continue;
      parsedUrl.searchParams.append(key, interpolate(q.value ?? ""));
    }

    const headers: Record<string, string> = {};
    for (const h of node.params.headers || []) {
      if (h.enabled === false) continue;
      const key = h.key.trim();
      if (!key) continue;
      headers[key] = interpolate(h.value ?? "");
    }

    const auth = node.params.auth;
    if (auth && auth.type !== "none") {
      if (auth.type === "bearer") {
        const token = interpolate(auth.token ?? "");
        setHeaderIfAbsent(headers, "Authorization", `Bearer ${token}`);
      } else if (auth.type === "basic") {
        const username = interpolate(auth.username ?? "");
        const password = interpolate(auth.password ?? "");
        const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
        setHeaderIfAbsent(headers, "Authorization", `Basic ${encoded}`);
      } else if (auth.type === "apiKey") {
        const keyName = interpolate(auth.keyName ?? "").trim();
        const keyValue = interpolate(auth.keyValue ?? "");
        if (keyName) {
          if (auth.in === "query") {
            parsedUrl.searchParams.append(keyName, keyValue);
          } else {
            setHeaderIfAbsent(headers, keyName, keyValue);
          }
        }
      }
    }

    let body: BodyInit | undefined;
    const allowsBody = method !== "GET" && method !== "HEAD";
    const bodyType = node.params.bodyType || "none";

    if (allowsBody && bodyType !== "none") {
      if (bodyType === "json") {
        const rawJson = node.params.bodyJson ?? "";
        const tokenRef = resolveSingleTokenValue(rawJson, ctx);
        if (tokenRef.isSingleToken && tokenRef.found) {
          body = JSON.stringify(tokenRef.value);
        } else {
          body = interpolate(rawJson);
        }
        setHeaderIfAbsent(headers, "Content-Type", "application/json");
      } else if (bodyType === "formUrlEncoded") {
        const searchParams = new URLSearchParams();
        for (const item of node.params.bodyForm || []) {
          if (item.enabled === false) continue;
          const key = item.key.trim();
          if (!key) continue;
          searchParams.append(key, interpolate(item.value ?? ""));
        }
        body = searchParams.toString();
        setHeaderIfAbsent(headers, "Content-Type", "application/x-www-form-urlencoded");
      } else if (bodyType === "multipart") {
        // Dejar que fetch genere Content-Type con el boundary correcto
        const existingCt = findHeaderIgnoreCase(headers, "content-type");
        if (existingCt) {
          delete headers[existingCt];
        }
        const formData = new FormData();
        for (const field of node.params.bodyMultipart || []) {
          if (field.enabled === false) continue;
          const key = field.key.trim();
          if (!key) continue;

          if (field.fieldType === "fileBase64") {
            const tokenRef = resolveSingleTokenValue(field.value ?? "", ctx);
            const binaryRef = tokenRef.found ? extractBinaryFromValue(tokenRef.value) : null;
            let fileBuf: Buffer;
            let mimeType = field.contentType?.trim() || "application/octet-stream";
            let filename = field.filename?.trim() || "file.bin";

            if (binaryRef) {
              fileBuf = binaryRef.buffer;
              mimeType = field.contentType?.trim() || binaryRef.contentType || mimeType;
              filename = field.filename?.trim() || binaryRef.filename || filename;
            } else {
              const rawB64 = interpolate(field.value ?? "").trim();
              const clean = rawB64.replace(/^data:([^;]+);base64,/, (_, detectedMime: string) => {
                if (!field.contentType?.trim()) {
                  mimeType = detectedMime;
                }
                return "";
              });
              fileBuf = Buffer.from(clean, "base64");
            }

            const blob = new Blob([new Uint8Array(fileBuf)], { type: mimeType });
            formData.append(key, blob, filename);
          } else {
            formData.append(key, interpolate(field.value ?? ""));
          }
        }
        body = formData;
      } else if (bodyType === "raw") {
        body = interpolate(node.params.bodyRaw ?? "");
        setHeaderIfAbsent(
          headers,
          "Content-Type",
          node.params.rawContentType?.trim() || "text/plain; charset=utf-8"
        );
      } else if (bodyType === "binary") {
        const rawInput = node.params.bodyBinaryBase64 ?? "";
        const tokenRef = resolveSingleTokenValue(rawInput, ctx);
        const binaryRef = tokenRef.found ? extractBinaryFromValue(tokenRef.value) : null;
        if (binaryRef) {
          body = new Uint8Array(binaryRef.buffer);
          setHeaderIfAbsent(
            headers,
            "Content-Type",
            node.params.binaryContentType?.trim() ||
              binaryRef.contentType ||
              "application/octet-stream"
          );
        } else {
          const b64 = interpolate(rawInput).trim().replace(/^data:[^;]+;base64,/, "");
          body = new Uint8Array(Buffer.from(b64, "base64"));
          setHeaderIfAbsent(
            headers,
            "Content-Type",
            node.params.binaryContentType?.trim() || "application/octet-stream"
          );
        }
      }
    }

    const timeoutMs = Math.max(500, Math.min(300_000, node.params.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    const targetUrl = parsedUrl.toString();
    let response: globalThis.Response;
    try {
      response = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: node.params.followRedirects === false ? "manual" : "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: unknown) {
      throw formatFetchError(err, targetUrl);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    const contentType = responseHeaders["content-type"] ?? "";
    const configuredType = node.params.responseType || "auto";
    const resolvedType =
      configuredType === "auto" ? detectAutoResponseType(contentType) : configuredType;

    let data: unknown = null;
    if (resolvedType === "headersOnly") {
      await response.body?.cancel().catch(() => undefined);
      data = null;
    } else {
      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error(
          `La respuesta HTTP excedió el límite permitido (${MAX_RESPONSE_BYTES} bytes)`
        );
      }
      const buffer = Buffer.from(arrayBuf);

      if (resolvedType === "binary") {
        data = {
          base64: buffer.toString("base64"),
          contentType: contentType || "application/octet-stream",
          sizeBytes: buffer.byteLength,
          filename: parseFilenameFromDisposition(responseHeaders["content-disposition"] ?? null),
        };
      } else if (resolvedType === "json") {
        const text = buffer.toString("utf8");
        if (text.trim() === "") {
          data = null;
        } else {
          try {
            data = JSON.parse(text);
          } catch {
            // Si el endpoint anunció JSON o el usuario eligió JSON pero devolvió texto plano (ej. error HTML)
            if (configuredType === "json" && response.ok) {
              throw new Error(`La respuesta no es JSON válido: ${text.slice(0, 200)}`);
            }
            data = text;
          }
        }
      } else {
        data = buffer.toString("utf8");
      }
    }

    const durationMs = Date.now() - startedAt;
    const output = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url || parsedUrl.toString(),
      headers: responseHeaders,
      contentType,
      responseType: resolvedType,
      data,
      durationMs,
    };

    const outputVariable = node.params.outputVariable?.trim();
    if (outputVariable) {
      ctx.variables[outputVariable] = output;
    }

    if (!response.ok && node.params.failOnHttpError !== false) {
      const preview =
        typeof data === "string"
          ? data.slice(0, 300)
          : data !== null && data !== undefined
            ? JSON.stringify(data).slice(0, 300)
            : "";
      throw new Error(
        `Petición HTTP ${method} falló con estado ${response.status} ${response.statusText}${
          preview ? `: ${preview}` : ""
        }`
      );
    }

    ctx.log?.("info", `HTTP ${method} ${parsedUrl.origin}${parsedUrl.pathname} -> ${response.status} (${durationMs}ms)`, {
      scope: "httpRequest",
      method,
      status: response.status,
      duration_ms: durationMs,
    });

    return {
      success: true,
      output,
      nextNodeId: node.next,
    };
  },
};
