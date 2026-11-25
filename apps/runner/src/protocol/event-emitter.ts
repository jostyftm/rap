import type { Redis } from "ioredis";
import { SecretRedactor } from "./redactor.js";
import { ulid } from "./ulid.js";

export interface RunWaitingInfo {
  method: string;
  path: string;
  timeoutMs: number | null;
  triggerUrl?: string | null;
  recipeId?: string;
}

export interface RunnerEventEmitter {
  emitRunStarted(runId: string): Promise<void>;
  emitRunWaiting(runId: string, nodeId: string, info: RunWaitingInfo): Promise<void>;
  emitStepStarted(runId: string, nodeId: string): Promise<void>;
  emitStepFinished(
    runId: string,
    nodeId: string,
    durationMs: number,
    locatorStrategy?: string,
    locatorValue?: string,
    screenshotPath?: string,
    output?: unknown
  ): Promise<void>;
  emitStepFailed(
    runId: string,
    nodeId: string,
    error: string,
    durationMs: number,
    screenshotPath?: string
  ): Promise<void>;
  emitRunFinished(
    runId: string,
    status: "success" | "failed",
    durationMs: number,
    error?: string,
    result?: Record<string, unknown>
  ): Promise<void>;
  emitRunLog(
    runId: string,
    level: "info" | "warn" | "error" | "success",
    message: string,
    nodeId?: string,
    source?: "runner" | "browser" | "network" | "live",
    context?: Record<string, unknown>
  ): Promise<void>;
  emitRunPaused(runId: string): Promise<void>;
  emitRunResumed(runId: string): Promise<void>;
  emitRunStopped(runId: string): Promise<void>;
}

const MAX_STEP_OUTPUT_BYTES = 16_384;
const MAX_RUN_RESULT_BYTES = 32_768;

/**
 * Serializa un valor JSON acotando su tamaño en bytes para no inflar Redis Streams ni DB.
 */
export function serializeBoundedJson(value: unknown, maxBytes: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  let raw: string | undefined;
  try {
    raw = JSON.stringify(value);
  } catch {
    raw = JSON.stringify({
      _unserializable: true,
      preview: String(value).slice(0, 512),
    });
  }

  if (raw === undefined) {
    return undefined;
  }

  const sizeBytes = Buffer.byteLength(raw, "utf8");
  if (sizeBytes <= maxBytes) {
    return raw;
  }

  return JSON.stringify({
    _truncated: true,
    size_bytes: sizeBytes,
    preview: raw.slice(0, Math.max(256, maxBytes - 128)),
  });
}

const REDACTED_FIELDS = new Set([
  "message",
  "error",
  "context",
  "locator_value",
  "value",
  "output",
  "result",
]);

export class RedisEventEmitter implements RunnerEventEmitter {
  private readonly redactors = new Map<string, SecretRedactor>();

  constructor(
    private redis: Redis,
    private streamName = "rpa:evt"
  ) {}

  registerRunSecrets(runId: string, secrets: Record<string, string>): void {
    const redactor = this.redactors.get(runId) ?? new SecretRedactor();
    redactor.setSecrets(secrets);
    this.redactors.set(runId, redactor);
  }

  clearRunSecrets(runId: string): void {
    this.redactors.delete(runId);
  }

  private redactBeforeSerialize(runId: string, value: unknown): unknown {
    const redactor = this.redactors.get(runId);
    return redactor ? redactor.redactRecord(value) : value;
  }

  private logToConsole(payload: Record<string, string>): void {
    if (process.env.RUNNER_CONSOLE_LOGS === "false") {
      return;
    }

    const shortId = (payload.run_id || "").slice(0, 8) || "unknown";
    switch (payload.event) {
      case "run.started":
        console.log(`[Run ${shortId}] ▶ Ejecución iniciada`);
        break;
      case "run.waiting":
        console.log(
          `[Run ${shortId}] ⏳ Esperando webhook (${payload.method || "POST"} ${payload.path || ""})`
        );
        break;
      case "run.paused":
        console.warn(`[Run ${shortId}] ⏸ Ejecución pausada`);
        break;
      case "run.resumed":
        console.log(`[Run ${shortId}] ▶ Ejecución reanudada`);
        break;
      case "run.stopped":
        console.warn(`[Run ${shortId}] ■ Ejecución detenida`);
        break;
      case "step.started":
        console.log(`[Run ${shortId}]   → Paso [${payload.node_id || "?"}] iniciado`);
        break;
      case "step.finished":
        console.log(
          `[Run ${shortId}]   ✓ Paso [${payload.node_id || "?"}] completado (${payload.duration_ms ?? 0}ms)${
            payload.screenshot_path ? " [captura]" : ""
          }`
        );
        break;
      case "step.failed":
        console.error(
          `[Run ${shortId}]   ✗ Paso [${payload.node_id || "?"}] falló (${payload.duration_ms ?? 0}ms): ${
            payload.error || "Error"
          }`
        );
        break;
      case "run.log": {
        const source = payload.source || "runner";
        const levelRaw = (payload.level || "info").toLowerCase();
        if (source !== "runner" && levelRaw !== "error" && levelRaw !== "warn") {
          break;
        }
        const nodePart = payload.node_id ? `[${payload.node_id}]` : "";
        const line = `[Run ${shortId}][${levelRaw.toUpperCase()}]${nodePart} ${payload.message || ""}`;
        if (levelRaw === "error") {
          console.error(line);
        } else if (levelRaw === "warn") {
          console.warn(line);
        } else {
          console.log(line);
        }
        break;
      }
      case "run.finished":
        if (payload.status === "success") {
          console.log(
            `[Run ${shortId}] ✓ Ejecución finalizada (success, ${payload.duration_ms ?? 0}ms)`
          );
        } else {
          console.error(
            `[Run ${shortId}] ✗ Ejecución finalizada (failed, ${payload.duration_ms ?? 0}ms): ${
              payload.error || ""
            }`
          );
        }
        break;
    }
  }

  private async emit(payload: Record<string, string | number | undefined>): Promise<void> {
    const cleanPayload: Record<string, string> = {};
    const runId = payload.run_id === undefined ? undefined : String(payload.run_id);
    const redactor = runId ? this.redactors.get(runId) : undefined;

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) {
        continue;
      }

      const asString = String(value);
      cleanPayload[key] = redactor && REDACTED_FIELDS.has(key) ? redactor.redactString(asString) : asString;
    }

    cleanPayload.id = ulid();
    this.logToConsole(cleanPayload);

    const streamMaxLen = Math.max(
      1000,
      Math.floor(Number(process.env.REDIS_STREAM_MAXLEN ?? 20_000)) || 20_000
    );

    try {
      await this.redis.xadd(
        this.streamName,
        "MAXLEN",
        "~",
        String(streamMaxLen),
        "*",
        ...Object.entries(cleanPayload).flat()
      );
    } catch (err) {
      console.error("[EventEmitter] Error emitiendo evento a Redis Stream:", err);
    }
  }

  async emitRunStarted(runId: string): Promise<void> {
    await this.emit({
      event: "run.started",
      run_id: runId,
      timestamp: Date.now(),
    });
  }

  async emitRunWaiting(runId: string, nodeId: string, info: RunWaitingInfo): Promise<void> {
    await this.emit({
      event: "run.waiting",
      run_id: runId,
      node_id: nodeId,
      method: info.method,
      path: info.path,
      timeout_ms: info.timeoutMs ?? undefined,
      trigger_url: info.triggerUrl ?? undefined,
      recipe_id: info.recipeId,
      timestamp: Date.now(),
    });
  }

  async emitStepStarted(runId: string, nodeId: string): Promise<void> {
    await this.emit({
      event: "step.started",
      run_id: runId,
      node_id: nodeId,
      timestamp: Date.now(),
    });
  }

  async emitStepFinished(
    runId: string,
    nodeId: string,
    durationMs: number,
    locatorStrategy?: string,
    locatorValue?: string,
    screenshotPath?: string,
    output?: unknown
  ): Promise<void> {
    const serializedOutput = serializeBoundedJson(
      this.redactBeforeSerialize(runId, output),
      MAX_STEP_OUTPUT_BYTES
    );

    await this.emit({
      event: "step.finished",
      run_id: runId,
      node_id: nodeId,
      duration_ms: durationMs,
      locator_strategy: locatorStrategy,
      locator_value: locatorValue,
      screenshot_path: screenshotPath,
      output: serializedOutput,
      timestamp: Date.now(),
    });
  }

  async emitStepFailed(
    runId: string,
    nodeId: string,
    error: string,
    durationMs: number,
    screenshotPath?: string
  ): Promise<void> {
    await this.emit({
      event: "step.failed",
      run_id: runId,
      node_id: nodeId,
      error,
      duration_ms: durationMs,
      screenshot_path: screenshotPath,
      timestamp: Date.now(),
    });
  }

  async emitRunFinished(
    runId: string,
    status: "success" | "failed",
    durationMs: number,
    error?: string,
    result?: Record<string, unknown>
  ): Promise<void> {
    const serializedResult = serializeBoundedJson(
      this.redactBeforeSerialize(runId, result),
      MAX_RUN_RESULT_BYTES
    );

    await this.emit({
      event: "run.finished",
      run_id: runId,
      status,
      duration_ms: durationMs,
      error,
      result: serializedResult,
      timestamp: Date.now(),
    });
  }

  async emitRunLog(
    runId: string,
    level: "info" | "warn" | "error" | "success",
    message: string,
    nodeId?: string,
    source?: "runner" | "browser" | "network" | "live",
    context?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      event: "run.log",
      run_id: runId,
      level,
      message,
      node_id: nodeId,
      source: source || "runner",
      context: context ? JSON.stringify(context) : undefined,
      timestamp: Date.now(),
    });
  }

  async emitRunPaused(runId: string): Promise<void> {
    await this.emit({
      event: "run.paused",
      run_id: runId,
      timestamp: Date.now(),
    });
  }

  async emitRunResumed(runId: string): Promise<void> {
    await this.emit({
      event: "run.resumed",
      run_id: runId,
      timestamp: Date.now(),
    });
  }

  async emitRunStopped(runId: string): Promise<void> {
    await this.emit({
      event: "run.stopped",
      run_id: runId,
      timestamp: Date.now(),
    });
  }
}
