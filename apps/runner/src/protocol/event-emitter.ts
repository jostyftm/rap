import type { Redis } from "ioredis";

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
}

export class RedisEventEmitter implements RunnerEventEmitter {
  constructor(
    private redis: Redis,
    private streamName = "rpa:evt"
  ) {}

  private async emit(payload: Record<string, string | number | undefined>): Promise<void> {
    const cleanPayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) {
        cleanPayload[k] = String(v);
      }
    }
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
}
