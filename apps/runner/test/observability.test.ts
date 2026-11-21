import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { RecipeDsl } from "@rpa/dsl";

const uploadedArtifacts: Array<{ key: string; contentType: string; size: number }> = [];

vi.mock("../src/storage/s3.js", () => ({
  ensureBucket: vi.fn().mockResolvedValue(undefined),
  uploadArtifactWithStatus: vi.fn(
    async (key: string, body: Buffer | Uint8Array | string, contentType = "image/png") => {
      const size = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
      uploadedArtifacts.push({ key, contentType, size });
      return { key, uploaded: true };
    }
  ),
  uploadArtifact: vi.fn(
    async (key: string, body: Buffer | Uint8Array | string, contentType = "image/png") => {
      const size = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
      uploadedArtifacts.push({ key, contentType, size });
      return key;
    }
  ),
}));

import { RedisEventEmitter, serializeBoundedJson, type RunnerEventEmitter } from "../src/protocol/event-emitter.js";
import { RecipeExecutor } from "../src/engine/executor.js";

describe("Observabilidad del Runner (logs paso a paso, outputs, resultado y capturas)", () => {
  let server: http.Server;
  let baseUrl = "";

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><head><title>Portal Demo</title></head><body><h1 data-testid="greeting">Bienvenido RPA</h1></body></html>`
      );
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    uploadedArtifacts.length = 0;
  });

  it("serializa JSON acotado en bytes cuando excede el límite", () => {
    const small = serializeBoundedJson({ ok: true, items: [1, 2, 3] }, 1024);
    expect(JSON.parse(small!)).toEqual({ ok: true, items: [1, 2, 3] });

    const big = serializeBoundedJson({ text: "x".repeat(4000) }, 600);
    const parsed = JSON.parse(big!);
    expect(parsed._truncated).toBe(true);
    expect(parsed.size_bytes).toBeGreaterThan(4000);
    expect(typeof parsed.preview).toBe("string");
  });

  it("imprime paso a paso en consola y redacta secretos en output y result", async () => {
    const xaddCalls: any[][] = [];
    const fakeRedis = {
      xadd: vi.fn(async (...args: any[]) => {
        xaddCalls.push(args);
        return "1-0";
      }),
    } as any;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const emitter = new RedisEventEmitter(fakeRedis, "rpa:evt");
      emitter.registerRunSecrets("01M7ZGPR6GZ2Y5HEFD9HRH0SHG", {
        API_KEY: "super-secret-token-999",
      });

      await emitter.emitRunStarted("01M7ZGPR6GZ2Y5HEFD9HRH0SHG");
      await emitter.emitStepStarted("01M7ZGPR6GZ2Y5HEFD9HRH0SHG", "step_1");
      await emitter.emitRunLog(
        "01M7ZGPR6GZ2Y5HEFD9HRH0SHG",
        "info",
        "Usando clave super-secret-token-999 en paso",
        "step_1",
        "runner"
      );
      await emitter.emitStepFinished(
        "01M7ZGPR6GZ2Y5HEFD9HRH0SHG",
        "step_1",
        125,
        "css",
        "#ok",
        "runs/01/step_1.jpg",
        { token: "super-secret-token-999", count: 2 }
      );
      await emitter.emitRunFinished("01M7ZGPR6GZ2Y5HEFD9HRH0SHG", "success", 250, undefined, {
        final_url: "https://portal.test/secret/super-secret-token-999",
        outputs: { step_1: { secret: "super-secret-token-999" } },
      });

      const printed = logSpy.mock.calls.map((c) => c.join(" "));
      expect(printed.some((line) => line.includes("[Run 01M7ZGPR] ▶ Ejecución iniciada"))).toBe(true);
      expect(printed.some((line) => line.includes("→ Paso [step_1] iniciado"))).toBe(true);
      expect(printed.some((line) => line.includes("[Run 01M7ZGPR][INFO][step_1] Usando clave *** en paso"))).toBe(true);
      expect(printed.some((line) => line.includes("✓ Paso [step_1] completado (125ms) [captura]"))).toBe(true);
      expect(printed.some((line) => line.includes("✓ Ejecución finalizada (success, 250ms)"))).toBe(true);
      expect(printed.join("\n")).not.toContain("super-secret-token-999");

      const stepFinishedRaw = xaddCalls[3];
      const stepOutputIdx = stepFinishedRaw.indexOf("output");
      expect(stepOutputIdx).toBeGreaterThan(-1);
      expect(JSON.parse(stepFinishedRaw[stepOutputIdx + 1])).toEqual({
        token: "***",
        count: 2,
      });

      const runFinishedRaw = xaddCalls[4];
      const runResultIdx = runFinishedRaw.indexOf("result");
      expect(runResultIdx).toBeGreaterThan(-1);
      expect(JSON.parse(runFinishedRaw[runResultIdx + 1])).toEqual({
        final_url: "https://portal.test/secret/***",
        outputs: { step_1: { secret: "***" } },
      });
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("emite capturas automáticas, output de pasos y resultado final en RecipeExecutor", async () => {
    const stepFinishedEvents: Array<{
      nodeId: string;
      screenshotPath?: string;
      output?: unknown;
    }> = [];
    let finishedPayload: { status: string; result?: Record<string, unknown> } | null = null;

    const mockEmitter: RunnerEventEmitter = {
      emitRunStarted: vi.fn().mockResolvedValue(undefined),
      emitRunWaiting: vi.fn().mockResolvedValue(undefined),
      emitStepStarted: vi.fn().mockResolvedValue(undefined),
      emitStepFinished: vi.fn(
        async (_runId, nodeId, _durationMs, _ls, _lv, screenshotPath, output) => {
          stepFinishedEvents.push({ nodeId, screenshotPath, output });
        }
      ),
      emitStepFailed: vi.fn().mockResolvedValue(undefined),
      emitRunFinished: vi.fn(async (_runId, status, _durationMs, _err, result) => {
        finishedPayload = { status, result };
      }),
      emitRunLog: vi.fn().mockResolvedValue(undefined),
      emitRunPaused: vi.fn().mockResolvedValue(undefined),
      emitRunResumed: vi.fn().mockResolvedValue(undefined),
      emitRunStopped: vi.fn().mockResolvedValue(undefined),
    };

    const executor = new RecipeExecutor(mockEmitter);
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Webhook con Observabilidad",
      entry: "webhook_1",
      nodes: {
        webhook_1: {
          id: "webhook_1",
          type: "webhook",
          description: "Recibir pedido",
          params: { httpMethod: "POST", path: "/api/v1/webhooks/demo", outputVariable: "webhook" },
          next: "nav_1",
        },
        nav_1: {
          id: "nav_1",
          type: "navigate",
          description: "Abrir portal",
          params: { url: baseUrl },
          next: "extract_1",
        },
        extract_1: {
          id: "extract_1",
          type: "extract",
          description: "Leer título H1",
          locator: {
            primary: { strategy: "testid", value: "greeting", score: 95 },
            fallbacks: [],
          },
          params: { extractType: "text", variable: "titulo" },
        },
      },
      edges: [
        { from: "webhook_1", to: "nav_1" },
        { from: "nav_1", to: "extract_1" },
      ],
    };

    const outcome = await executor.execute({
      runId: "run_obs_001",
      recipe,
      trigger: "webhook",
      parameters: {
        webhook: {
          method: "POST",
          path: "/api/v1/webhooks/demo",
          headers: {},
          query: {},
          params: {},
          body: { cliente: "Ada" },
          timestamp: "2026-11-21T12:00:00Z",
        },
      },
    });

    await executor.close();

    expect(outcome.success).toBe(true);
    expect(stepFinishedEvents.map((s) => s.nodeId)).toEqual(["webhook_1", "nav_1", "extract_1"]);

    // Webhook no toma screenshot porque aún está en about:blank, pero sí emite output
    expect(stepFinishedEvents[0].screenshotPath).toBeUndefined();
    expect(stepFinishedEvents[0].output).toMatchObject({ body: { cliente: "Ada" } });

    // Navigate y extract capturan JPEG automático y emiten su output
    expect(stepFinishedEvents[1].screenshotPath).toMatch(/^runs\/run_obs_001\/screenshots\/nav_1-\d+\.jpg$/);
    expect(stepFinishedEvents[1].output).toMatchObject({ title: "Portal Demo" });
    expect(stepFinishedEvents[2].screenshotPath).toMatch(/^runs\/run_obs_001\/screenshots\/extract_1-\d+\.jpg$/);
    expect(stepFinishedEvents[2].output).toBe("Bienvenido RPA");

    const screenshots = uploadedArtifacts.filter((a) => a.contentType === "image/jpeg");
    const traces = uploadedArtifacts.filter((a) => a.contentType === "application/zip");
    expect(screenshots.length).toBe(2);
    expect(traces.length).toBe(1);

    expect(finishedPayload?.status).toBe("success");
    expect(finishedPayload?.result).toMatchObject({
      final_title: "Portal Demo",
      counters: expect.objectContaining({ steps: 3, errors: 0 }),
      last_screenshot_path: stepFinishedEvents[2].screenshotPath,
    });
    expect((finishedPayload?.result?.outputs as any)?.extract_1).toBe("Bienvenido RPA");
  }, 30000);
});
