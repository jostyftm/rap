import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RecipeDsl } from "@rpa/dsl";
import { RecipeExecutor } from "../src/engine/executor.js";
import type { RunnerEventEmitter, RunWaitingInfo } from "../src/protocol/event-emitter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsiteDir = path.resolve(__dirname, "../../../testsite");

let server: http.Server;
const TEST_PORT = 8099;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : (req.url?.split("?")[0] || "/index.html");
    const filePath = path.join(testsiteDir, urlPath);
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        // Testsite ya está corriendo como servicio de fondo en el puerto 8099
        resolve();
      } else {
        reject(err);
      }
    });
    server.listen(TEST_PORT, () => resolve());
  });
});

afterAll(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

class MockEventEmitter implements RunnerEventEmitter {
  public events: { type: string; payload: any }[] = [];

  async emitRunStarted(runId: string): Promise<void> {
    this.events.push({ type: "run.started", payload: { runId } });
  }
  async emitRunWaiting(runId: string, nodeId: string, info: RunWaitingInfo): Promise<void> {
    this.events.push({ type: "run.waiting", payload: { runId, nodeId, info } });
  }
  async emitStepStarted(runId: string, nodeId: string): Promise<void> {
    this.events.push({ type: "step.started", payload: { runId, nodeId } });
  }
  async emitStepFinished(
    runId: string,
    nodeId: string,
    durationMs: number,
    locatorStrategy?: string,
    locatorValue?: string,
    screenshotPath?: string
  ): Promise<void> {
    this.events.push({
      type: "step.finished",
      payload: { runId, nodeId, durationMs, locatorStrategy, locatorValue, screenshotPath },
    });
  }
  async emitStepFailed(
    runId: string,
    nodeId: string,
    error: string,
    durationMs: number,
    screenshotPath?: string
  ): Promise<void> {
    this.events.push({
      type: "step.failed",
      payload: { runId, nodeId, error, durationMs, screenshotPath },
    });
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

describe("E2E Deterministic Recipe Execution (Phase 1)", () => {
  it("ejecuta una receta Playwright completa sin IA de forma determinista", async () => {
    const mockEmitter = new MockEventEmitter();
    const executor = new RecipeExecutor(mockEmitter);

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Receta Determinista de Prueba",
      entry: "step_navigate",
      variables: [
        { name: "extractedWelcome", type: "string" },
      ],
      nodes: {
        step_navigate: {
          id: "step_navigate",
          type: "navigate",
          description: "Navegar a la pantalla de login",
          params: { url: `http://localhost:${TEST_PORT}/index.html` },
          next: "step_fill_user",
        },
        step_fill_user: {
          id: "step_fill_user",
          type: "type",
          description: "Ingresar nombre de usuario",
          locator: {
            primary: { strategy: "testid", value: "username-input", score: 95 },
            fallbacks: [{ strategy: "css", value: "#username", score: 70 }],
          },
          params: { text: "admin_test", clear: true },
          next: "step_fill_pass",
        },
        step_fill_pass: {
          id: "step_fill_pass",
          type: "type",
          description: "Ingresar contraseña",
          locator: {
            primary: { strategy: "testid", value: "password-input", score: 95 },
            fallbacks: [{ strategy: "css", value: "#password", score: 70 }],
          },
          params: { text: "secret123", clear: true },
          next: "step_click_login",
        },
        step_click_login: {
          id: "step_click_login",
          type: "click",
          description: "Hacer clic en Iniciar Sesión",
          locator: {
            primary: { strategy: "testid", value: "login-submit-btn", score: 95 },
            fallbacks: [{ strategy: "role", value: "button[name='Iniciar Sesión']", score: 90 }],
          },
          params: { button: "left", clickCount: 1 },
          next: "step_wait_dashboard",
        },
        step_wait_dashboard: {
          id: "step_wait_dashboard",
          type: "waitFor",
          description: "Esperar a cargar el dashboard",
          params: { strategy: "url", value: "dashboard.html" },
          next: "step_extract_welcome",
        },
        step_extract_welcome: {
          id: "step_extract_welcome",
          type: "extract",
          description: "Extraer mensaje de bienvenida del panel",
          locator: {
            primary: { strategy: "testid", value: "welcome-message", score: 95 },
            fallbacks: [{ strategy: "css", value: "#welcome-message", score: 70 }],
          },
          params: { extractType: "text", variable: "extractedWelcome" },
          next: "step_screenshot_dash",
        },
        step_screenshot_dash: {
          id: "step_screenshot_dash",
          type: "screenshot",
          description: "Tomar captura del dashboard",
          params: { fullPage: false },
        },
      },
      edges: [
        { from: "step_navigate", to: "step_fill_user" },
        { from: "step_fill_user", to: "step_fill_pass" },
        { from: "step_fill_pass", to: "step_click_login" },
        { from: "step_click_login", to: "step_wait_dashboard" },
        { from: "step_wait_dashboard", to: "step_extract_welcome" },
        { from: "step_extract_welcome", to: "step_screenshot_dash" },
      ],
    };

    const result = await executor.execute({
      runId: "run_e2e_test_001",
      recipe,
    });

    if (!result.success) {
      console.error("EXECUTION ERROR:", result.error);
    }
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);

    // Verificar eventos emitidos en secuencia
    const startedSteps = mockEmitter.events
      .filter((e) => e.type === "step.started")
      .map((e) => e.payload.nodeId);

    expect(startedSteps).toEqual([
      "step_navigate",
      "step_fill_user",
      "step_fill_pass",
      "step_click_login",
      "step_wait_dashboard",
      "step_extract_welcome",
      "step_screenshot_dash",
    ]);

    const finishedSteps = mockEmitter.events
      .filter((e) => e.type === "step.finished")
      .map((e) => e.payload.nodeId);

    expect(finishedSteps.length).toBe(7);

    const runFinished = mockEmitter.events.find((e) => e.type === "run.finished");
    expect(runFinished?.payload.status).toBe("success");

    await executor.close();
  }, 30000);
});
