import type { Redis } from "ioredis";
import { SecretRedactor } from "./redactor.js";
import { ulid } from "./ulid.js";

export interface RunnerEventEmitter {
  emitRunStarted(runId: string): Promise<void>;
  emitStepStarted(runId: string, nodeId: string): Promise<void>;
  emitStepFinished(
    runId: string,
    nodeId: string,
    durationMs: number,
    locatorStrategy?: string,
    locatorValue?: string,
    screenshotPath?: string
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
    error?: string
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

const REDACTED_FIELDS = new Set(["message", "error", "context", "locator_value", "value"]);

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

    try {
      await this.redis.xadd(this.streamName, "*", ...Object.entries(cleanPayload).flat());
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
    screenshotPath?: string
  ): Promise<void> {
    await this.emit({
      event: "step.finished",
      run_id: runId,
      node_id: nodeId,
      duration_ms: durationMs,
      locator_strategy: locatorStrategy,
      locator_value: locatorValue,
      screenshot_path: screenshotPath,
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
    error?: string
  ): Promise<void> {
    await this.emit({
      event: "run.finished",
      run_id: runId,
      status,
      duration_ms: durationMs,
      error,
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
