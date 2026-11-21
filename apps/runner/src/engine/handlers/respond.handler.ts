import type { Page } from "playwright";
import type { RespondNode, RespondType } from "@rpa/dsl";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter, resolveSingleTokenValue } from "./token-warnings.js";
import type {
  ActionResult,
  AutomationResponse,
  ExecutionContext,
  NodeActionHandler,
} from "./types.js";

const FORBIDDEN_RESPONSE_HEADERS = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
]);

function defaultStatusForType(responseType: RespondType): number {
  if (responseType === "empty") return 204;
  if (responseType === "redirect") return 302;
  return 200;
}

function defaultContentTypeForType(responseType: RespondType): string {
  switch (responseType) {
    case "json":
      return "application/json; charset=utf-8";
    case "text":
      return "text/plain; charset=utf-8";
    case "html":
      return "text/html; charset=utf-8";
    case "xml":
      return "application/xml; charset=utf-8";
    case "binary":
      return "application/octet-stream";
    case "redirect":
    case "empty":
      return "";
  }
}

function normalizeStatusCode(rawCode: number | undefined, responseType: RespondType): number {
  const code = rawCode ?? defaultStatusForType(responseType);
  if (!Number.isFinite(code)) return defaultStatusForType(responseType);
  return Math.max(100, Math.min(599, Math.trunc(code)));
}

function isBinaryPayload(
  value: unknown
): value is { base64: string; contentType?: string; filename?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "base64" in value &&
    typeof (value as { base64?: unknown }).base64 === "string"
  );
}

function stripDataUriPrefix(raw: string): { base64: string; detectedMime?: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return { detectedMime: match[1].trim(), base64: match[2].trim() };
  }
  return { base64: trimmed };
}

export const respondHandler: NodeActionHandler<RespondNode> = {
  type: "respond",
  async execute(
    _page: Page,
    node: RespondNode,
    ctx: ExecutionContext
  ): Promise<ActionResult> {
    const onMissingTokens = createMissingTokenReporter(node.id, node.type, ctx);
    const responseType = node.params.responseType || "json";
    const statusCode = normalizeStatusCode(node.params.statusCode, responseType);

    const headers: Record<string, string> = {};
    for (const pair of node.params.headers || []) {
      if (pair.enabled === false) continue;
      const key = pair.key.trim();
      if (!key) continue;
      if (FORBIDDEN_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
      headers[key] = interpolateString(pair.value ?? "", ctx.variables, ctx.secrets, {
        onMissingTokens,
      });
    }

    let contentType = node.params.contentType?.trim() || defaultContentTypeForType(responseType);
    let body = "";
    let isBase64 = false;
    let filename = node.params.filename?.trim() || undefined;
    let redirectUrl: string | undefined;

    if (responseType === "redirect") {
      const rawRedirect = node.params.redirectUrl?.trim() || "";
      const interpolated = interpolateString(rawRedirect, ctx.variables, ctx.secrets, {
        onMissingTokens,
      }).trim();
      if (
        !interpolated ||
        (!interpolated.startsWith("http://") &&
          !interpolated.startsWith("https://") &&
          !interpolated.startsWith("/"))
      ) {
        throw new Error(
          `URL de redirección inválida en nodo '${node.id}': debe iniciar con http://, https:// o /`
        );
      }
      redirectUrl = interpolated;
      headers["Location"] = interpolated;
      contentType = "";
    } else if (responseType === "empty") {
      body = "";
      contentType = "";
    } else if (responseType === "binary") {
      const rawBody = node.params.body ?? "";
      const tokenRef = resolveSingleTokenValue(rawBody, ctx);
      isBase64 = true;

      if (tokenRef.isSingleToken && tokenRef.found && isBinaryPayload(tokenRef.value)) {
        const cleaned = stripDataUriPrefix(tokenRef.value.base64);
        body = cleaned.base64;
        if (!node.params.contentType?.trim()) {
          contentType =
            tokenRef.value.contentType ||
            cleaned.detectedMime ||
            "application/octet-stream";
        }
        if (!filename && tokenRef.value.filename) {
          filename = tokenRef.value.filename;
        }
      } else {
        const strVal =
          tokenRef.isSingleToken && tokenRef.found && typeof tokenRef.value === "string"
            ? tokenRef.value
            : interpolateString(rawBody, ctx.variables, ctx.secrets, { onMissingTokens });
        const cleaned = stripDataUriPrefix(strVal);
        body = cleaned.base64;
        if (!node.params.contentType?.trim() && cleaned.detectedMime) {
          contentType = cleaned.detectedMime;
        }
      }
    } else if (responseType === "json") {
      const rawBody = node.params.body ?? "";
      if (!rawBody.trim()) {
        body = JSON.stringify({ ok: true });
      } else {
        const tokenRef = resolveSingleTokenValue(rawBody, ctx);
        if (tokenRef.isSingleToken) {
          if (!tokenRef.found) {
            onMissingTokens([rawBody.trim().slice(2, -2).trim()]);
          }
          body = JSON.stringify(tokenRef.found ? tokenRef.value : null);
        } else {
          const interpolated = interpolateString(rawBody, ctx.variables, ctx.secrets, {
            onMissingTokens,
          });
          try {
            const parsed = JSON.parse(interpolated);
            body = JSON.stringify(parsed);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(
              `El cuerpo JSON del nodo '${node.id}' no es un JSON válido tras interpolar variables: ${msg}`
            );
          }
        }
      }
    } else {
      // text | html | xml
      const rawBody = node.params.body ?? "";
      body = interpolateString(rawBody, ctx.variables, ctx.secrets, { onMissingTokens });
    }

    if (filename) {
      filename = interpolateString(filename, ctx.variables, ctx.secrets, { onMissingTokens })
        .replace(/["\r\n]/g, "")
        .trim();
    }

    const built: AutomationResponse = {
      kind: "respond",
      responseType,
      statusCode,
      contentType,
      headers,
      body,
      isBase64,
      filename,
      redirectUrl,
      nodeId: node.id,
    };

    ctx.response = built;
    if (ctx.emitResponse) {
      await ctx.emitResponse(built);
    }

    ctx.log?.("success", `Respuesta preparada (${responseType}, HTTP ${statusCode})`, {
      scope: "respond",
      responseType,
      statusCode,
      contentType,
      terminateFlow: node.params.terminateFlow !== false,
    });

    const output = {
      responseType,
      statusCode,
      contentType,
      headers,
      filename,
      redirectUrl,
      isBase64,
      bodyPreview: isBase64
        ? `[binary ${Math.floor((body.length * 3) / 4)} bytes]`
        : body.slice(0, 2000),
    };

    return {
      success: true,
      output,
      terminateFlow: node.params.terminateFlow !== false,
      nextNodeId: node.next,
    };
  },
};
