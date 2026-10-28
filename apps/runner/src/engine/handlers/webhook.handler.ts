import type { Page } from "playwright";
import type { WebhookNode } from "@rpa/dsl";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

const DEFAULT_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "user-agent": "RPAStudio-Webhook/1.0",
};

const ENVELOPE_MARKERS = ["method", "path", "query", "headers", "params", "timestamp"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detecta si el valor ya tiene la forma estructurada que produce el backend
 * (`{ method, path, headers, query, body, ... }`) en lugar de ser el cuerpo crudo.
 */
function isPayloadEnvelope(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !("body" in value)) return false;
  return ENVELOPE_MARKERS.some((marker) => marker in value);
}

/**
 * Construye el payload estructurado del webhook.
 *
 * Acepta tanto un envelope completo como el cuerpo crudo enviado por la API o
 * por los parámetros de la ejecución. En ese caso el valor se usa como `body`.
 */
export function buildWebhookPayload(
  node: WebhookNode,
  rawParameters: Record<string, unknown> = {}
): Record<string, unknown> {
  const envelope = isPayloadEnvelope(rawParameters) ? rawParameters : undefined;

  const body = envelope ? envelope.body : rawParameters;
  const headers = envelope && isRecord(envelope.headers) ? envelope.headers : {};
  const query = envelope && isRecord(envelope.query) ? envelope.query : {};
  const params = envelope && isRecord(envelope.params) ? envelope.params : {};

  return {
    method:
      typeof envelope?.method === "string" ? envelope.method : (node.params.httpMethod ?? "POST"),
    path: typeof envelope?.path === "string" ? envelope.path : (node.params.path ?? "/webhook"),
    headers: { ...DEFAULT_HEADERS, ...headers },
    params,
    query,
    body: body ?? {},
    timestamp:
      typeof envelope?.timestamp === "string" ? envelope.timestamp : new Date().toISOString(),
  };
}

export const webhookHandler: NodeActionHandler<WebhookNode> = {
  type: "webhook",
  async execute(_page: Page, node: WebhookNode, ctx: ExecutionContext): Promise<ActionResult> {
    const varName = node.params.outputVariable || "webhook";

    // Fuente principal: variables ya inicializadas (payload estructurado o cuerpo)
    // o, en su defecto, los parámetros crudos con los que arrancó la ejecución.
    const provided = ctx.variables[varName] ?? ctx.variables.webhook;

    let payload: Record<string, unknown>;
    if (isPayloadEnvelope(provided)) {
      payload = buildWebhookPayload(node, provided);
    } else if (provided !== undefined) {
      payload = buildWebhookPayload(node, isRecord(provided) ? provided : { value: provided });
    } else {
      payload = buildWebhookPayload(node, ctx.parameters ?? {});
    }

    ctx.variables[varName] = payload;
    ctx.variables.webhook = payload;

    return {
      success: true,
      output: payload,
      nextNodeId: node.next,
    };
  },
};
