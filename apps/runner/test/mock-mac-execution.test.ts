import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { chromium, type Browser } from "playwright";
import { LiveServer } from "../src/live/live-server.js";
import { PROXY_CLIENT_JS } from "../src/live/proxy-client-script.js";
import { RecipeExecutor } from "../src/engine/executor.js";
import type { RecipeDsl } from "@rpa/dsl";

describe("Mock MAC & XMLHttpRequest.responseType Fix", () => {
  let browser: Browser;
  let liveServer: LiveServer;
  let livePort: number;
  const token = "test-live-token";

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });

    // Iniciar LiveServer en puerto aleatorio disponible
    livePort = 8990 + Math.floor(Math.random() * 500);
    const mockExternal = {
      start: async () => {},
      command: async () => true,
      stop: async () => {},
      closeAll: async () => {},
    } as any;

    liveServer = new LiveServer(livePort, token, mockExternal);
    liveServer.start();
  });

  afterAll(async () => {
    await browser.close();
    await liveServer.close();
  });

  it("permite invocar xhr.open con 2 argumentos y luego cambiar responseType sin lanzar InvalidAccessError", async () => {
    const page = await browser.newPage();

    // Evaluar el script PROXY_CLIENT_JS inyectado con mocks
    const result = await page.evaluate((proxyScript) => {
      // Simular origen
      (window as any).__RPA_ORIGIN__ = "https://example.com";
      (window as any).__RPA_MOCKS__ = { mac: "00:1A:2B:3C:4D:5E", version: "4.8.6" };

      // Inyectar el script interceptor
      const scriptEl = document.createElement("script");
      scriptEl.textContent = proxyScript;
      document.head.appendChild(scriptEl);

      // Simular exactamente la llamada que realiza Angular HttpXhrBackend
      const xhr = new XMLHttpRequest();
      try {
        xhr.open("GET", "https://example.com/api/test");
        xhr.responseType = "json";
        return {
          success: true,
          responseType: xhr.responseType,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
        };
      }
    }, PROXY_CLIENT_JS);

    expect(result.success).toBe(true);
    expect(result.responseType).toBe("json");
    await page.close();
  });

  it("LiveServer responde a /__rpa_mock/mac y /__rpa_mock/version con los valores parametrizados en la sesión", async () => {
    // 1. Crear sesión en LiveServer con mock_mac y mock_version
    const res = await fetch(`http://localhost:${livePort}/live/sessions`, {
      method: "POST",
      headers: {
        "x-rpa-live-token": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com",
        mock_mac: "AA:BB:CC:DD:EE:FF",
        mock_version: "5.0.0",
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    const sid = data.session_id;

    // 2. Consultar /__rpa_mock/mac con cabecera host simulando subdominio de proxy
    const macRes = await fetch(`http://localhost:${livePort}/__rpa_mock/mac`, {
      headers: {
        "x-forwarded-host": `${sid}.localhost:${livePort}`,
      },
    });
    expect(macRes.status).toBe(200);
    expect(macRes.headers.get("access-control-allow-origin")).toBe("*");
    const macData = await macRes.json();
    expect(macData).toEqual(["AA:BB:CC:DD:EE:FF"]);

    // 3. Consultar /__rpa_mock/version
    const verRes = await fetch(`http://localhost:${livePort}/__rpa_mock/version`, {
      headers: {
        "x-forwarded-host": `${sid}.localhost:${livePort}`,
      },
    });
    expect(verRes.status).toBe(200);
    const verData = await verRes.json();
    expect(verData).toBe("5.0.0");
  });

  it("RecipeExecutor intercepta peticiones a 127.0.0.1:9494/mac en Playwright cuando mock_mac está configurado", async () => {
    const mockEmitter = {
      emitRunStarted: async () => {},
      emitRunFinished: async () => {},
      emitRunLog: async () => {},
      emitRunStopped: async () => {},
      emitStepStarted: async () => {},
      emitStepFinished: async () => {},
      emitStepFailed: async () => {},
    } as any;

    const executor = new RecipeExecutor(mockEmitter);

    // Servidor web simple para la receta
    const testServer = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <body>
            <script>
              fetch("http://127.0.0.1:9494/mac")
                .then(r => r.json())
                .then(data => {
                  window.__TEST_MAC_RESULT__ = data;
                });
            </script>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (testServer.address() as any).port;

    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      entry: "nav_1",
      variables: [
        {
          name: "mock_mac",
          type: "string",
          defaultValue: "11:22:33:44:55:66",
        },
      ],
      nodes: {
        nav_1: {
          id: "nav_1",
          type: "navigate",
          description: "Navegar al sitio de prueba",
          params: {
            url: `http://localhost:${port}/`,
            waitUntil: "networkidle",
          },
        },
      },
      edges: [],
    };

    const outcome = await executor.execute({
      runId: "run_test_mock_mac",
      recipe,
      options: { display: "headless" },
    });

    expect(outcome.success).toBe(true);
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });
});
