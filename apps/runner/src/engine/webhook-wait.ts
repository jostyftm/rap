import type { Redis } from "ioredis";
import type { WebhookNode } from "@rpa/dsl";
import type { RunWaitingInfo, RunnerEventEmitter } from "../protocol/event-emitter.js";

/** Espera por defecto para ejecuciones de prueba (manuales / Estudio). */
export const DEFAULT_TEST_WEBHOOK_WAIT_MS = 300_000;

/** TTL de las claves de espera en producción; el runner las refresca mientras espera. */
const PRODUCTION_WAIT_TTL_SECONDS = 86_400;
const TEST_WAIT_TTL_MARGIN_SECONDS = 60;
const REFRESH_INTERVAL_MS = 60_000;
const POLL_INTERVAL_MS = 500;

export type WebhookWaitOutcome =
  | { kind: "payload"; payload: Record<string, unknown>; receivedBeforeStart: boolean }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "stopped" }
  | { kind: "unavailable"; reason: string };

export interface WaitForWebhookOptions {
  runId: string;
  recipeId?: string;
  node: WebhookNode;
  trigger?: string;
  triggerUrl?: string | null;
  webhookEnabled?: boolean;
  redis?: Redis;
  controlKey: string;
  emitter: RunnerEventEmitter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Un run solo espera si no recibió ningún parámetro. Los parámetros crudos se
 * usan como cuerpo del webhook por retrocompatibilidad con `{{campo}}`.
 */
export function hasWebhookPayload(parameters: Record<string, unknown>): boolean {
  return Object.keys(parameters).length > 0;
}

/**
 * Inyecta el envelope recibido en los parámetros y variables del run para que
 * el handler del webhook y los tokens posteriores lo resuelvan igual que en un
 * disparo HTTP normal.
 */
export function mergeWebhookPayload(
  parameters: Record<string, unknown>,
  node: WebhookNode,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const outputVariable = node.params.outputVariable || "webhook";
  const body = isRecord(payload.body) ? payload.body : {};

  const merged: Record<string, unknown> = {
    ...body,
    ...parameters,
    webhook: payload,
  };

  if (outputVariable !== "webhook") {
    merged[outputVariable] = payload;
  }

  return merged;
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : { body: parsed };
  } catch {
    return { body: raw };
  }
}

function resolveTimeoutMs(node: WebhookNode, trigger?: string): number | null {
  const isTest = !trigger || trigger === "manual";
  if (!isTest) {
    return null;
  }

  return typeof node.timeout === "number" && node.timeout > 0
    ? node.timeout
    : DEFAULT_TEST_WEBHOOK_WAIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeWait(timeoutMs: number | null): string {
  return timeoutMs === null
    ? "indefinidamente (modo producción)"
    : `hasta ${Math.round(timeoutMs / 1000)}s (modo prueba)`;
}

export function normalizeWebhookPath(p: string): string {
  const clean = p.trim();
  if (!clean) return "";
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

export function alternateWebhookPath(p: string): string {
  if (p.startsWith("/api/v1/webhooks/")) {
    return `/${p.slice("/api/v1/webhooks/".length)}`;
  }
  if (p === "/api/v1/webhooks") {
    return "/";
  }
  return `/api/v1/webhooks${p}`;
}

/**
 * Espera la petición HTTP de un webhook que es el nodo principal del flujo.
 *
 * El runner registra la espera en Redis y sondea la lista donde la API deposita
 * el payload. Mientras espera no se lanza el navegador ni se ejecuta ningún
 * nodo posterior.
 */
export async function waitForWebhookPayload(
  options: WaitForWebhookOptions
): Promise<WebhookWaitOutcome> {
  const { runId, recipeId, node, trigger, triggerUrl, webhookEnabled, redis, controlKey, emitter } =
    options;

  if (!redis) {
    return { kind: "unavailable", reason: "Redis no está disponible en el runner" };
  }

  if (!recipeId) {
    return { kind: "unavailable", reason: "El run no incluye recipe_id" };
  }

  const method = node.params.httpMethod ?? "POST";
  const path = node.params.path ?? "/webhook";
  const timeoutMs = resolveTimeoutMs(node, trigger);
  const waitingKey = `rpa:run:${runId}:waiting`;
  const payloadKey = `rpa:run:${runId}:webhook`;
  const indexKey = `rpa:recipe:${recipeId}:waiting`;
  const ttlSeconds =
    timeoutMs === null
      ? PRODUCTION_WAIT_TTL_SECONDS
      : Math.max(60, Math.ceil(timeoutMs / 1000) + TEST_WAIT_TTL_MARGIN_SECONDS);

  // Si la petición llegó antes de que arrancara el runner, se consume directo.
  const early = await redis.lpop(payloadKey);
  if (early) {
    await emitter.emitRunLog(
      runId,
      "info",
      "Petición webhook recibida antes de iniciar la ejecución. Continuando...",
      node.id,
      "runner",
      { scope: "webhook", node_id: node.id, path, method, received_before_start: true }
    );
    return { kind: "payload", payload: parsePayload(early), receivedBeforeStart: true };
  }

  const meta = JSON.stringify({
    run_id: runId,
    recipe_id: recipeId,
    node_id: node.id,
    trigger: trigger ?? "manual",
    created_at: new Date().toISOString(),
    timeout_ms: timeoutMs,
  });

  const normPath = normalizeWebhookPath(path);
  const altPath = alternateWebhookPath(normPath);
  const pathKeys = [
    `rpa:webhook:path:${normPath}:waiting`,
    ...(altPath !== normPath && altPath !== "" ? [`rpa:webhook:path:${altPath}:waiting`] : []),
  ];

  await redis.set(waitingKey, meta, "EX", ttlSeconds);
  await redis.hset(indexKey, runId, meta);
  await redis.expire(indexKey, ttlSeconds);

  for (const pk of pathKeys) {
    await redis.hset(pk, runId, meta);
    await redis.expire(pk, ttlSeconds);
  }

  const waitInfo: RunWaitingInfo = {
    method,
    path,
    timeoutMs,
    triggerUrl,
    recipeId,
  };

  await emitter.emitRunWaiting(runId, node.id, waitInfo);

  const destination = !webhookEnabled
    ? "El webhook público está deshabilitado; habilítalo en Triggers o usa 'Escuchar evento de prueba' en el nodo."
    : triggerUrl
      ? `Trigger público: ${triggerUrl}.`
      : "Usa 'Escuchar evento de prueba' en el nodo para enviar la petición.";

  await emitter.emitRunLog(
    runId,
    "info",
    `Esperando petición webhook [${method} ${path}] ${describeWait(timeoutMs)}. ${destination}`,
    node.id,
    "runner",
    {
      scope: "webhook",
      node_id: node.id,
      method,
      path,
      timeout_ms: timeoutMs,
      trigger_url: triggerUrl ?? null,
      webhook_enabled: webhookEnabled ?? null,
    }
  );

  const deadline = timeoutMs === null ? null : Date.now() + timeoutMs;
  let lastRefresh = Date.now();

  const cleanup = async (): Promise<void> => {
    await redis.del(waitingKey).catch(() => undefined);
    await redis.del(payloadKey).catch(() => undefined);
    await redis.hdel(indexKey, runId).catch(() => undefined);
    for (const pk of pathKeys) {
      await redis.hdel(pk, runId).catch(() => undefined);
    }
  };

  try {
    for (;;) {
      const raw = await redis.lpop(payloadKey);
      if (raw) {
        await emitter.emitRunLog(
          runId,
          "info",
          "Petición webhook recibida. Continuando ejecución...",
          node.id,
          "runner",
          { scope: "webhook", node_id: node.id, path, method }
        );
        return { kind: "payload", payload: parsePayload(raw), receivedBeforeStart: false };
      }

      const control = await redis.get(controlKey);
      if (control === "stop") {
        await emitter.emitRunLog(
          runId,
          "warn",
          "Espera de webhook cancelada por el usuario.",
          node.id,
          "runner",
          { scope: "webhook", node_id: node.id }
        );
        return { kind: "stopped" };
      }

      if (deadline !== null && Date.now() >= deadline) {
        await emitter.emitRunLog(
          runId,
          "warn",
          `No se recibió ninguna petición webhook en ${Math.round(timeoutMs! / 1000)}s. La ejecución se detendrá sin ejecutar los nodos siguientes.`,
          node.id,
          "runner",
          { scope: "webhook", node_id: node.id, timeout_ms: timeoutMs }
        );
        return { kind: "timeout", timeoutMs: timeoutMs! };
      }

      if (Date.now() - lastRefresh >= REFRESH_INTERVAL_MS) {
        await redis.expire(waitingKey, ttlSeconds).catch(() => undefined);
        await redis.expire(indexKey, ttlSeconds).catch(() => undefined);
        for (const pk of pathKeys) {
          await redis.expire(pk, ttlSeconds).catch(() => undefined);
        }
        lastRefresh = Date.now();
      }

      await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    await cleanup();
  }
}
