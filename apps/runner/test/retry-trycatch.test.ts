import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RecipeDsl } from "@rpa/dsl";
import { RecipeExecutor } from "../src/engine/executor.js";
import type { RunnerEventEmitter } from "../src/protocol/event-emitter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsiteDir = path.resolve(__dirname, "../../../testsite");
const TEST_PORT = 8098;
const BASE_URL = `http://localhost:${TEST_PORT}`;

const DELAYED_HTML = `<!doctype html>
<html>
  <head><title>Delayed</title></head>
  <body>
    <p id="status">Esperando botón…</p>
    <script>
      setTimeout(() => {
        const button = document.createElement("button");
        button.setAttribute("data-testid", "late-btn");
        button.textContent = "Listo";
        document.body.appendChild(button);
      }, 500);
    </script>
  </body>
</html>`;

let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/delayed.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(DELAYED_HTML);
      return;
    }

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

const navigate = (id: string, url: string, next?: string): any => ({
  id,
  type: "navigate",
  description: `Navegar a ${url}`,
  params: { url },
  ...(next ? { next } : {}),
});

const setVariable = (id: string, name: string, expression: string, next?: string): any => ({
  id,
  type: "setVariable",
  description: `Asignar ${name}`,
  params: { name, expression },
  ...(next ? { next } : {}),
});

const failingClick = (id: string, next?: string): any => ({
  id,
  type: "click",
  description: "Clic que falla",
  locator: {
    primary: { strategy: "css", value: "#does-not-exist", score: 20 },
    fallbacks: [],
  },
  params: { button: "left", clickCount: 1 },
  timeout: 250,
  screenshot: "never",
  ...(next ? { next } : {}),
});

describe("Retry & tryCatch execution", () => {
  const emitter = new MockEventEmitter();
  const executor = new RecipeExecutor(emitter);

  afterAll(async () => {
    await executor.close();
  });

  it("reintenta un nodo hasta que la acción tiene éxito", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Retry hasta éxito",
      entry: "go",
      nodes: {
        go: navigate("go", `${BASE_URL}/delayed.html`, "retry_click"),
        retry_click: {
          id: "retry_click",
          type: "click",
          description: "Clic en botón tardío",
          locator: {
            primary: { strategy: "testid", value: "late-btn", score: 90 },
            fallbacks: [],
          },
          params: { button: "left", clickCount: 1 },
          timeout: 150,
          screenshot: "never",
          onError: "retry",
          retry: { maxAttempts: 3, delayMs: 700, backoff: "fixed" },
          next: "done",
        },
        done: setVariable("done", "retry_ok", "true"),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_retry_success", recipe });

    expect(result.success).toBe(true);
    expect(emitter.logs().some((log) => log.message.includes("intento 1/3"))).toBe(true);
    expect(emitter.events.some((e) => e.type === "step.failed")).toBe(false);
    expect(
      emitter.events
        .filter((e) => e.type === "step.started")
        .map((e) => e.payload.nodeId)
    ).toContain("done");
  }, 45000);

  it("agota los reintentos y emite un único step.failed", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Retry agotado",
      entry: "go",
      nodes: {
        go: navigate("go", `${BASE_URL}/index.html`, "retry_click"),
        retry_click: {
          ...failingClick("retry_click"),
          onError: "retry",
          retry: { maxAttempts: 3, delayMs: 10, backoff: "fixed" },
        },
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_retry_exhausted", recipe });

    const failedEvents = emitter.events.filter((e) => e.type === "step.failed");
    const retryWarnings = emitter.logs().filter((log) => log.message.includes("Reintentando"));

    expect(result.success).toBe(false);
    expect(failedEvents).toHaveLength(1);
    expect(retryWarnings).toHaveLength(2);
  }, 45000);

  it("captura el error en catch, ejecuta finally y continúa", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "TryCatch con recuperación",
      entry: "go",
      nodes: {
        go: navigate("go", `${BASE_URL}/index.html`, "tc"),
        tc: {
          id: "tc",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "try_click",
            catchEntryNodeId: "catch_var",
            finallyEntryNodeId: "finally_var",
            errorVariable: "error",
            rethrow: false,
          },
          next: "cont",
        },
        try_click: failingClick("try_click", "cont"),
        catch_var: setVariable("catch_var", "recovered", "'sí'", "cont"),
        finally_var: setVariable("finally_var", "finallyRan", "true", "cont"),
        cont: setVariable("cont", "continued", "true"),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_trycatch_recover", recipe });
    const logs = emitter.logs();
    const started = emitter.events
      .filter((e) => e.type === "step.started")
      .map((e) => e.payload.nodeId);

    expect(result.success).toBe(true);
    expect(logs.some((log) => log.message === "Entrando en bloque try")).toBe(true);
    expect(logs.some((log) => log.message.includes("Error capturado en [try_click]"))).toBe(true);
    expect(logs.some((log) => log.message === "Ejecutando bloque finally")).toBe(true);
    expect(logs.some((log) => log.message.includes("error capturado y manejado"))).toBe(true);
    expect(started).toContain("catch_var");
    expect(started).toContain("finally_var");
    expect(started).toContain("cont");
    expect(emitter.events.find((e) => e.type === "run.finished")?.payload.status).toBe("success");
  }, 45000);

  it("no ejecuta catch cuando el bloque try tiene éxito, pero sí finally", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "TryCatch sin error",
      entry: "go",
      nodes: {
        go: navigate("go", `${BASE_URL}/index.html`, "tc"),
        tc: {
          id: "tc",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "try_ok",
            catchEntryNodeId: "catch_var",
            finallyEntryNodeId: "finally_var",
          },
          next: "cont",
        },
        try_ok: navigate("try_ok", `${BASE_URL}/index.html`, "cont"),
        catch_var: setVariable("catch_var", "recovered", "'no debería'", "cont"),
        finally_var: setVariable("finally_var", "finallyRan", "true", "cont"),
        cont: setVariable("cont", "continued", "true"),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_trycatch_success", recipe });
    const logs = emitter.logs();
    const started = emitter.events
      .filter((e) => e.type === "step.started")
      .map((e) => e.payload.nodeId);

    expect(result.success).toBe(true);
    expect(logs.some((log) => log.message.includes("Error capturado"))).toBe(false);
    expect(started).not.toContain("catch_var");
    expect(started).toContain("finally_var");
    expect(started).toContain("cont");
  }, 45000);

  it("propaga el error con rethrow después de ejecutar catch y finally", async () => {
    emitter.reset();

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "TryCatch con rethrow",
      entry: "go",
      nodes: {
        go: navigate("go", `${BASE_URL}/index.html`, "tc"),
        tc: {
          id: "tc",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "try_click",
            catchEntryNodeId: "catch_var",
            finallyEntryNodeId: "finally_var",
            rethrow: true,
          },
          next: "cont",
        },
        try_click: failingClick("try_click", "cont"),
        catch_var: setVariable("catch_var", "recovered", "true", "cont"),
        finally_var: setVariable("finally_var", "finallyRan", "true", "cont"),
        cont: setVariable("cont", "continued", "true"),
      },
      edges: [],
    };

    const result = await executor.execute({ runId: "run_trycatch_rethrow", recipe });
    const logs = emitter.logs();
    const started = emitter.events
      .filter((e) => e.type === "step.started")
      .map((e) => e.payload.nodeId);

    expect(result.success).toBe(false);
    expect(started).toContain("catch_var");
    expect(started).toContain("finally_var");
    expect(started).not.toContain("cont");
    expect(logs.some((log) => log.message === "Ejecutando bloque finally")).toBe(true);
    expect(emitter.events.find((e) => e.type === "run.finished")?.payload.status).toBe("failed");
  }, 45000);
});
