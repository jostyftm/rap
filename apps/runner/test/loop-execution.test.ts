import { describe, it, expect, afterAll } from "vitest";
import type { RecipeDsl } from "@rpa/dsl";
import { RecipeExecutor } from "../src/engine/executor.js";
import type { RunnerEventEmitter } from "../src/protocol/event-emitter.js";

class MockEventEmitter implements RunnerEventEmitter {
  public events: { type: string; payload: any }[] = [];

  reset(): void {
    this.events = [];
  }

  logs(): any[] {
    return this.events.filter((e) => e.type === "run.log").map((e) => e.payload);
  }

  async emitRunStarted(runId: string): Promise<void> {
    this.events.push({ type: "run.started", payload: { runId } });
  }
  async emitStepStarted(runId: string, nodeId: string): Promise<void> {
    this.events.push({ type: "step.started", payload: { runId, nodeId } });
  }
  async emitStepFinished(runId: string, nodeId: string, durationMs: number): Promise<void> {
    this.events.push({ type: "step.finished", payload: { runId, nodeId, durationMs } });
  }
  async emitStepFailed(runId: string, nodeId: string, error: string, durationMs: number): Promise<void> {
    this.events.push({ type: "step.failed", payload: { runId, nodeId, error, durationMs } });
  }
  async emitRunFinished(
    runId: string,
    status: "success" | "failed",
    durationMs: number,
    error?: string
  ): Promise<void> {
    this.events.push({ type: "run.finished", payload: { runId, status, durationMs, error } });
  }
  async emitRunLog(
    runId: string,
    level: "info" | "warn" | "error" | "success",
    message: string,
    nodeId?: string,
    source?: "runner" | "browser" | "network" | "live",
    context?: Record<string, unknown>
  ): Promise<void> {
    this.events.push({
      type: "run.log",
      payload: { runId, level, message, nodeId, source, context },
    });
  }
  async emitRunPaused(runId: string): Promise<void> {
    this.events.push({ type: "run.paused", payload: { runId } });
  }
  async emitRunResumed(runId: string): Promise<void> {
    this.events.push({ type: "run.resumed", payload: { runId } });
  }
  async emitRunStopped(runId: string): Promise<void> {
    this.events.push({ type: "run.stopped", payload: { runId } });
  }
}

const setVariable = (id: string, name: string, expression: string, next?: string): any => ({
  id,
  type: "setVariable",
  description: `Asignar ${name}`,
  params: { name, expression },
  ...(next ? { next } : {}),
});

const loop = (
  id: string,
  bodyEntryNodeId: string,
  options: { itemVariable?: string; maxIterations?: number; next?: string; collection?: string } = {}
): any => ({
  id,
  type: "loop",
  description: `Bucle ${id}`,
  params: {
    collectionExpression: options.collection ?? "variables.items",
    itemVariable: options.itemVariable ?? "item",
    bodyEntryNodeId,
    maxIterations: options.maxIterations ?? 10,
  },
  ...(options.next ? { next: options.next } : {}),
});

describe("Loop execution", () => {
  const emitter = new MockEventEmitter();
  const executor = new RecipeExecutor(emitter);

  afterAll(async () => {
    await executor.close();
  });

  it("no ejecuta el cuerpo cuando la colección está vacía y continúa el flujo", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Loop vacío",
      entry: "init_items",
      nodes: {
        init_items: setVariable("init_items", "items", "[]", "loop_1"),
        loop_1: loop("loop_1", "body_add", { next: "done" }),
        body_add: setVariable("body_add", "total", "total + item", "done"),
        done: setVariable("done", "summary", "true"),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_loop_empty", recipe });
    const started = emitter.events
      .filter((e) => e.type === "step.started")
      .map((e) => e.payload.nodeId);

    expect(result.success).toBe(true);
    expect(started).not.toContain("body_add");
    expect(started).toContain("done");
    expect(
      emitter.logs().some((log) => log.message.includes("0 elemento(s), se ejecutarán 0"))
    ).toBe(true);
  }, 45000);

  it("itera todos los elementos y actualiza las variables del cuerpo", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Loop completo",
      entry: "init_items",
      nodes: {
        init_items: setVariable("init_items", "items", "[1, 2, 3]", "init_total"),
        init_total: setVariable("init_total", "total", "0", "loop_1"),
        loop_1: loop("loop_1", "body_add", { next: "done" }),
        body_add: setVariable("body_add", "total", "total + item", "done"),
        done: setVariable(
          "done",
          "summary",
          '{"total": total, "items": $count(items)}',
          undefined
        ),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_loop_full", recipe });
    const iterationLogs = emitter.logs().filter((log) =>
      log.message.startsWith("Iteración ")
    );
    const doneLog = emitter.logs().find(
      (log) => log.nodeId === "done" && log.context?.output
    );

    expect(result.success).toBe(true);
    expect(iterationLogs).toHaveLength(3);
    expect(doneLog?.context?.output).toEqual({ total: 6, items: 3 });
    expect(
      emitter.events.filter(
        (e) => e.type === "step.started" && e.payload.nodeId === "body_add"
      )
    ).toHaveLength(3);
  }, 45000);

  it("respeta maxIterations y avisa cuando trunca la colección", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Loop truncado",
      entry: "init_items",
      nodes: {
        init_items: setVariable("init_items", "items", "[1, 2, 3, 4, 5]", "init_total"),
        init_total: setVariable("init_total", "total", "0", "loop_1"),
        loop_1: loop("loop_1", "body_add", { maxIterations: 2, next: "done" }),
        body_add: setVariable("body_add", "total", "total + item", "done"),
        done: setVariable("done", "summary", '{"total": total}'),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_loop_truncated", recipe });
    const doneLog = emitter.logs().find(
      (log) => log.nodeId === "done" && log.context?.output
    );
    const warning = emitter.logs().find((log) =>
      log.message.includes("alcanzó el límite de 2 iteraciones")
    );

    expect(result.success).toBe(true);
    expect(doneLog?.context?.output).toEqual({ total: 3 });
    expect(warning).toBeDefined();
    expect(warning?.level).toBe("warn");
  }, 45000);

  it("soporta bucles anidados con contadores independientes", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Loops anidados",
      entry: "init_acc",
      nodes: {
        init_acc: setVariable("init_acc", "acc", "0", "outer_loop"),
        outer_loop: loop("outer_loop", "inner_loop", {
          itemVariable: "outerItem",
          next: "done",
          collection: "[1, 2]",
        }),
        inner_loop: loop("inner_loop", "body_add", {
          itemVariable: "innerItem",
          maxIterations: 2,
          next: "done",
          collection: "[10, 20]",
        }),
        body_add: setVariable("body_add", "acc", "acc + 1", "done"),
        done: setVariable("done", "summary", '{"acc": acc}'),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_loop_nested", recipe });
    const doneLog = emitter.logs().find(
      (log) => log.nodeId === "done" && log.context?.output
    );

    expect(result.success).toBe(true);
    expect(doneLog?.context?.output).toEqual({ acc: 4 });
    expect(
      emitter.events.filter(
        (e) => e.type === "step.started" && e.payload.nodeId === "body_add"
      )
    ).toHaveLength(4);
  }, 45000);
});
