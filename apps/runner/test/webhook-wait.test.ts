import { describe, it, expect } from "vitest";
import type { Redis } from "ioredis";
import type { WebhookNode } from "@rpa/dsl";
import type { RunWaitingInfo, RunnerEventEmitter } from "../src/protocol/event-emitter.js";
import {
  DEFAULT_TEST_WEBHOOK_WAIT_MS,
  hasWebhookPayload,
  mergeWebhookPayload,
  waitForWebhookPayload,
} from "../src/engine/webhook-wait.js";

class FakeRedis {
  lists = new Map<string, string[]>();

  strings = new Map<string, string>();

  hashes = new Map<string, Record<string, string>>();

  ttls = new Map<string, number>();

  async lpop(key: string): Promise<string | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.shift() ?? null;
  }

  async rpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, _mode?: string, ttl?: number): Promise<"OK"> {
    this.strings.set(key, value);
    if (typeof ttl === "number") this.ttls.set(key, ttl);
    return "OK";
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const hash = this.hashes.get(key) ?? {};
    hash[field] = value;
    this.hashes.set(key, hash);
    return 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.hashes.get(key) ?? {};
  }

  async hdel(key: string, field: string): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash || !(field in hash)) return 0;
    delete hash[field];
    return 1;
  }

  async expire(key: string, ttl: number): Promise<number> {
    this.ttls.set(key, ttl);
    return 1;
  }

  async del(key: string): Promise<number> {
    this.strings.delete(key);
    this.lists.delete(key);
    return 1;
  }
}

class MockEmitter implements RunnerEventEmitter {
  events: { type: string; payload: any }[] = [];

  async emitRunStarted(runId: string): Promise<void> {
    this.events.push({ type: "run.started", payload: { runId } });
  }

  async emitRunWaiting(runId: string, nodeId: string, info: RunWaitingInfo): Promise<void> {
    this.events.push({ type: "run.waiting", payload: { runId, nodeId, info } });
  }

  async emitStepStarted(runId: string, nodeId: string): Promise<void> {
    this.events.push({ type: "step.started", payload: { runId, nodeId } });
  }

  async emitStepFinished(): Promise<void> {}

  async emitStepFailed(): Promise<void> {}

  async emitRunFinished(runId: string, status: string, durationMs: number, error?: string): Promise<void> {
    this.events.push({ type: "run.finished", payload: { runId, status, durationMs, error } });
  }

  async emitRunStopped(runId: string): Promise<void> {
    this.events.push({ type: "run.stopped", payload: { runId } });
  }

  async emitRunPaused(): Promise<void> {}

  async emitRunResumed(): Promise<void> {}

  async emitRunLog(
    runId: string,
    level: "info" | "warn" | "error" | "success",
    message: string,
    nodeId?: string,
    source?: "runner" | "browser" | "network" | "live",
    context?: Record<string, unknown>
  ): Promise<void> {
    this.events.push({ type: "run.log", payload: { runId, level, message, nodeId, source, context } });
  }
}

function webhookNode(overrides: Partial<WebhookNode["params"]> = {}): WebhookNode {
  return {
    id: "wh_1",
    type: "webhook",
    params: {
      httpMethod: "POST",
      path: "/api/v1/webhooks/hook",
      outputVariable: "webhook",
      ...overrides,
    },
  } as WebhookNode;
}

const baseOptions = {
  runId: "run-1",
  recipeId: "recipe-1",
  controlKey: "rpa:run:run-1:control",
};

describe("webhook wait helpers", () => {
  it("detecta si el run ya trae payload", () => {
    expect(hasWebhookPayload({})).toBe(false);
    expect(hasWebhookPayload({ email: "x@y.z" })).toBe(true);
  });

  it("mezcla el envelope en los parámetros y en la variable de salida", () => {
    const payload = { body: { email: "x@y.z" }, method: "POST" };
    const merged = mergeWebhookPayload({ existente: 1 }, webhookNode({ outputVariable: "lead" }), payload);

    expect(merged.existente).toBe(1);
    expect(merged.email).toBe("x@y.z");
    expect(merged.webhook).toEqual(payload);
    expect(merged.lead).toEqual(payload);
  });

  it("consume un payload que llegó antes de arrancar el runner sin registrar espera", async () => {
    const redis = new FakeRedis();
    await redis.rpush("rpa:run:run-1:webhook", JSON.stringify({ body: { email: "early@y.z" } }));
    const emitter = new MockEmitter();

    const outcome = await waitForWebhookPayload({
      ...baseOptions,
      node: webhookNode(),
      trigger: "manual",
      redis: redis as unknown as Redis,
      emitter,
    });

    expect(outcome).toEqual({
      kind: "payload",
      payload: { body: { email: "early@y.z" } },
      receivedBeforeStart: true,
    });
    expect(redis.strings.has("rpa:run:run-1:waiting")).toBe(false);
    expect(redis.hashes.get("rpa:recipe:recipe-1:waiting")).toBeUndefined();
  });

  it("registra la espera, emite run.waiting y continúa cuando llega la petición", async () => {
    const redis = new FakeRedis();
    const emitter = new MockEmitter();

    const promise = waitForWebhookPayload({
      ...baseOptions,
      node: webhookNode(),
      trigger: "manual",
      triggerUrl: "http://localhost:8000/api/v1/webhooks/recipes/token/trigger",
      webhookEnabled: true,
      redis: redis as unknown as Redis,
      emitter,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(redis.strings.has("rpa:run:run-1:waiting")).toBe(true);
    expect(redis.hashes.get("rpa:recipe:recipe-1:waiting")?.["run-1"]).toBeTruthy();
    expect(emitter.events.some((event) => event.type === "run.waiting")).toBe(true);

    await redis.rpush(
      "rpa:run:run-1:webhook",
      JSON.stringify({ method: "POST", body: { email: "live@y.z" } })
    );

    const outcome = await promise;

    expect(outcome.kind).toBe("payload");
    if (outcome.kind === "payload") {
      expect(outcome.receivedBeforeStart).toBe(false);
      expect((outcome.payload.body as Record<string, unknown>).email).toBe("live@y.z");
    }
    expect(redis.strings.has("rpa:run:run-1:waiting")).toBe(false);
    expect(redis.hashes.get("rpa:recipe:recipe-1:waiting")?.["run-1"]).toBeUndefined();
  });

  it("falla por timeout en modo prueba sin ejecutar los nodos siguientes", async () => {
    const redis = new FakeRedis();
    const emitter = new MockEmitter();

    const outcome = await waitForWebhookPayload({
      ...baseOptions,
      node: { ...webhookNode(), timeout: 1 } as WebhookNode,
      trigger: "manual",
      redis: redis as unknown as Redis,
      emitter,
    });

    expect(outcome).toEqual({ kind: "timeout", timeoutMs: 1 });
    expect(redis.strings.has("rpa:run:run-1:waiting")).toBe(false);
  });

  it("cancela la espera cuando el usuario detiene el run", async () => {
    const redis = new FakeRedis();
    await redis.set("rpa:run:run-1:control", "stop");
    const emitter = new MockEmitter();

    const outcome = await waitForWebhookPayload({
      ...baseOptions,
      node: webhookNode(),
      trigger: "webhook",
      redis: redis as unknown as Redis,
      emitter,
    });

    expect(outcome).toEqual({ kind: "stopped" });
    expect(redis.strings.has("rpa:run:run-1:waiting")).toBe(false);
  });

  it("no espera en producción cuando ya existe un payload", async () => {
    const redis = new FakeRedis();
    await redis.rpush("rpa:run:run-1:webhook", JSON.stringify({ body: { ok: true } }));

    const outcome = await waitForWebhookPayload({
      ...baseOptions,
      node: webhookNode(),
      trigger: "webhook",
      redis: redis as unknown as Redis,
      emitter: new MockEmitter(),
    });

    expect(outcome.kind).toBe("payload");
  });

  it("informa indisponibilidad si falta Redis o recipe_id", async () => {
    const emitter = new MockEmitter();

    const withoutRedis = await waitForWebhookPayload({
      ...baseOptions,
      node: webhookNode(),
      redis: undefined,
      emitter,
    });
    expect(withoutRedis.kind).toBe("unavailable");

    const withoutRecipe = await waitForWebhookPayload({
      runId: "run-1",
      node: webhookNode(),
      controlKey: baseOptions.controlKey,
      redis: new FakeRedis() as unknown as Redis,
      emitter,
    });
    expect(withoutRecipe.kind).toBe("unavailable");
  });

  it("usa el timeout por defecto de 5 minutos en modo prueba", async () => {
    expect(DEFAULT_TEST_WEBHOOK_WAIT_MS).toBe(300_000);
  });
});
