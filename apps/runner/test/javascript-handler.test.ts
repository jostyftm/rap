import { describe, it, expect, vi, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type { JavascriptNode } from "@rpa/dsl";
import {
  executeNodeAction,
  type ExecutionContext,
} from "../src/engine/action-handlers.js";

describe("javascriptHandler", () => {
  let browser: Browser | null = null;

  afterAll(async () => {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  });

  const createContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => ({
    runId: "run_js_test",
    variables: { taxRate: 0.19, prefix: "ORD" },
    secrets: { DB_PASS: "top-secret-password-99" },
    stepResults: {
      extract_1: [{ price: 100 }, { price: 250 }],
    },
    parameters: {
      webhook: { body: { customer: "Ada" } },
    },
    ...overrides,
  });

  const dummyPage = {} as Page;

  it("ejecuta código síncrono y asíncrono en sandbox leyendo variables, steps e input", async () => {
    const ctx = createContext();
    const node: JavascriptNode = {
      id: "js_1",
      type: "javascript",
      description: "Calcular totales",
      params: {
        mode: "sandbox",
        outputVariable: "resumen",
        code: `
          const items = steps.extract_1.output;
          const subtotal = items.reduce((acc, item) => acc + item.price, 0);
          await Promise.resolve();
          const total = Math.round(subtotal * (1 + variables.taxRate));
          setVariable("ordenCodigo", variables.prefix + "-" + total);
          return {
            customer: input.webhook.body.customer,
            subtotal,
            total,
          };
        `,
      },
      next: "step_next",
    };

    const result = await executeNodeAction(dummyPage, node, ctx);

    expect(result.success).toBe(true);
    expect(result.nextNodeId).toBe("step_next");
    expect(result.output).toEqual({
      customer: "Ada",
      subtotal: 350,
      total: 417,
    });
    expect(ctx.variables.resumen).toEqual(result.output);
    expect(ctx.variables.ordenCodigo).toBe("ORD-417");
  });

  it("captura console.log y console.warn enviándolos al log de ejecución", async () => {
    const logs: Array<{ level: string; message: string }> = [];
    const ctx = createContext({
      log: (level, message) => logs.push({ level, message }),
    });

    const node: JavascriptNode = {
      id: "js_logs",
      type: "javascript",
      description: "Probar console",
      params: {
        mode: "sandbox",
        code: `
          console.log("Procesando", { count: 2 });
          console.warn("Advertencia de prueba");
          return "ok";
        `,
      },
    };

    const result = await executeNodeAction(dummyPage, node, ctx);
    expect(result.output).toBe("ok");
    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      level: "info",
      message: '[JS js_logs] Procesando {"count":2}',
    });
    expect(logs[1]).toEqual({
      level: "warn",
      message: "[JS js_logs] Advertencia de prueba",
    });
  });

  it("bloquea acceso a process, require y secrets dentro del sandbox", async () => {
    const ctx = createContext();
    const node: JavascriptNode = {
      id: "js_iso",
      type: "javascript",
      description: "Comprobar aislamiento",
      params: {
        mode: "sandbox",
        code: `
          return {
            hasProcess: typeof process,
            hasRequire: typeof require,
            hasSecrets: typeof secrets,
            secretInVars: variables.DB_PASS ?? null,
          };
        `,
      },
    };

    const result = await executeNodeAction(dummyPage, node, ctx);
    expect(result.output).toEqual({
      hasProcess: "undefined",
      hasRequire: "undefined",
      hasSecrets: "undefined",
      secretInVars: null,
    });
  });

  it("aborta por timeout tanto en bucles síncronos infinitos como en promesas bloqueadas", async () => {
    const ctx = createContext();

    const syncInfinite: JavascriptNode = {
      id: "js_loop_sync",
      type: "javascript",
      description: "Bucle infinito",
      timeout: 150,
      params: {
        mode: "sandbox",
        code: "while (true) {}",
      },
    };

    await expect(executeNodeAction(dummyPage, syncInfinite, ctx)).rejects.toThrow(/timed out|agotado/i);

    const asyncHang: JavascriptNode = {
      id: "js_hang_async",
      type: "javascript",
      description: "Promesa colgada",
      timeout: 150,
      params: {
        mode: "sandbox",
        code: "await new Promise(() => {});",
      },
    };

    await expect(executeNodeAction(dummyPage, asyncHang, ctx)).rejects.toThrow(/agotado/i);
  });

  it("ejecuta JavaScript sobre el DOM de una página real de Playwright en modo browser", async () => {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(`
      <html>
        <head><title>Factura Demo</title></head>
        <body>
          <ul id="items">
            <li data-price="12">Manzana</li>
            <li data-price="18">Naranja</li>
          </ul>
        </body>
      </html>
    `);

    const ctx = createContext();
    const node: JavascriptNode = {
      id: "js_dom",
      type: "javascript",
      description: "Leer precios del DOM",
      params: {
        mode: "browser",
        outputVariable: "domSummary",
        code: `
          const rows = Array.from(document.querySelectorAll('#items li')).map((el) => ({
            name: el.textContent?.trim(),
            price: Number(el.getAttribute('data-price') || 0),
          }));
          return {
            title: document.title,
            prefix: variables.prefix,
            rows,
          };
        `,
      },
    };

    const result = await executeNodeAction(page, node, ctx);
    expect(result.output).toEqual({
      title: "Factura Demo",
      prefix: "ORD",
      rows: [
        { name: "Manzana", price: 12 },
        { name: "Naranja", price: 18 },
      ],
    });
    expect(ctx.variables.domSummary).toEqual(result.output);
  }, 20000);
});
