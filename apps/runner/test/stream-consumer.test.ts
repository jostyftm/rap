import { describe, it, expect, vi } from "vitest";
import { RedisStreamConsumer } from "../src/protocol/stream-consumer.js";
import type { RedisEventEmitter } from "../src/protocol/event-emitter.js";
import type { RecipeExecutor } from "../src/engine/executor.js";

function createFakeRunStartMessage(id: string, runId: string): [string, string[]] {
  const recipe = {
    schema: "rpa/v1",
    entry: "n1",
    nodes: {
      n1: {
        id: "n1",
        type: "setVariable",
        params: { name: "x", value: "1" },
      },
    },
  };

  return [
    id,
    [
      "id",
      `cmd-${runId}`,
      "command",
      "run.start",
      "run_id",
      runId,
      "recipe_id",
      "rec-1",
      "trigger",
      "webhook",
      "definition",
      JSON.stringify(recipe),
      "parameters",
      "{}",
      "options",
      "{}",
      "secret_refs",
      "[]",
    ],
  ];
}

function createFakeControlMessage(id: string, command: string, runId: string): [string, string[]] {
  return [
    id,
    [
      "id",
      `cmd-ctl-${id}`,
      "command",
      command,
      "run_id",
      runId,
    ],
  ];
}

describe("RedisStreamConsumer concurrency & blocking connection", () => {
  it("ejecuta recetas en paralelo respetando el límite de concurrencia, usa duplicate() para bloquear y permite run.stop inmediato", async () => {
    const setCalls: Array<{ key: string; value: string }> = [];
    const xackCalls: string[] = [];
    const blockingReadCounts: number[] = [];

    const queuedBatches: Array<[string, [string, string[]][]][] | null> = [
      [
        [
          "rpa:cmd",
          [
            createFakeRunStartMessage("1-0", "run-1"),
            createFakeRunStartMessage("2-0", "run-2"),
          ],
        ],
      ],
      [
        [
          "rpa:cmd",
          [
            createFakeRunStartMessage("3-0", "run-3"),
            createFakeControlMessage("4-0", "run.stop", "run-1"),
          ],
        ],
      ],
      null,
    ];

    const blockingRedis = {
      xreadgroup: vi.fn(async (...args: any[]) => {
        const countIdx = args.indexOf("COUNT");
        if (countIdx !== -1) {
          blockingReadCounts.push(Number(args[countIdx + 1]));
        }
        const next = queuedBatches.shift() ?? null;
        if (queuedBatches.length === 0) {
          consumer.stop();
        }
        return next;
      }),
      quit: vi.fn(async () => "OK"),
    };

    const mainRedis = {
      duplicate: vi.fn(() => blockingRedis),
      xgroup: vi.fn(async () => "OK"),
      xautoclaim: vi.fn(async () => ["0-0", []]),
      exists: vi.fn(async () => 0),
      set: vi.fn(async (key: string, value: string) => {
        setCalls.push({ key, value });
        return "OK";
      }),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        setCalls.push({ key, value });
        return "OK";
      }),
      xack: vi.fn(async (_stream: string, _group: string, msgId: string) => {
        xackCalls.push(msgId);
        return 1;
      }),
    } as any;

    const emitter: RedisEventEmitter = {
      registerRunSecrets: vi.fn(),
      clearRunSecrets: vi.fn(),
      emitRunLog: vi.fn(async () => {}),
      emitRunFinished: vi.fn(async () => {}),
    } as any;

    let inFlight = 0;
    let maxInFlight = 0;
    const resolvers = new Map<string, () => void>();
    const startedRuns: string[] = [];

    const fakeExecutor: RecipeExecutor = {
      execute: vi.fn(async ({ runId }: { runId: string }) => {
        startedRuns.push(runId);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => {
          resolvers.set(runId, resolve);
        });
        inFlight--;
        return { success: true, durationMs: 10 };
      }),
      close: vi.fn(async () => {}),
    } as any;

    const secretClient = {
      fetchSecrets: vi.fn(async () => ({})),
      clear: vi.fn(),
      clearAll: vi.fn(),
    } as any;

    const consumer = new RedisStreamConsumer(
      mainRedis,
      emitter,
      "rpa:cmd",
      "rpa:runners",
      "runner-test-1",
      secretClient,
      2,
      fakeExecutor
    );

    const consumerPromise = consumer.start();

    // Esperar a que las 2 primeras ejecuciones entren en vuelo simultáneamente
    await vi.waitFor(() => {
      expect(startedRuns).toEqual(["run-1", "run-2"]);
    });
    expect(maxInFlight).toBe(2);
    // Ambas fueron confirmadas al aceptarse sin esperar a que terminen
    expect(xackCalls).toContain("1-0");
    expect(xackCalls).toContain("2-0");
    // run-3 aún no debe haberse iniciado porque concurrency = 2
    expect(startedRuns).not.toContain("run-3");

    // Liberar run-1 -> ahora hay hueco para leer run-3 y run.stop
    resolvers.get("run-1")?.();

    await vi.waitFor(() => {
      expect(startedRuns).toContain("run-3");
      expect(setCalls.some((c) => c.key === "rpa:run:run-1:control" && c.value === "stop")).toBe(true);
    });

    // Liberar run-2 y run-3 para finalizar limpiamente
    resolvers.get("run-2")?.();
    resolvers.get("run-3")?.();

    await consumerPromise;

    expect(mainRedis.duplicate).toHaveBeenCalledTimes(1);
    expect(blockingRedis.xreadgroup).toHaveBeenCalled();
    expect(blockingReadCounts[0]).toBe(2);
    expect(blockingRedis.quit).toHaveBeenCalledTimes(1);
    expect(fakeExecutor.close).toHaveBeenCalledTimes(1);
  });
});
