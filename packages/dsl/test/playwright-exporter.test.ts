import { describe, it, expect } from "vitest";
import { exportToPlaywright, type RecipeDsl } from "../src/index.js";

describe("Playwright Exporter", () => {
  it("compila una receta lineal a código Playwright TypeScript válido", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Login Básico",
      entry: "step_nav",
      variables: [
        { name: "token", type: "string", defaultValue: "demo-token" },
      ],
      nodes: {
        step_nav: {
          id: "step_nav",
          type: "navigate",
          description: "Ir a login",
          params: { url: "https://example.com/login", waitUntil: "networkidle" },
          next: "step_type_user",
        },
        step_type_user: {
          id: "step_type_user",
          type: "type",
          description: "Escribir usuario",
          locator: {
            primary: { strategy: "testid", value: "username-field", score: 95 },
            fallbacks: [{ strategy: "css", value: "#username", score: 70 }],
          },
          params: { text: "admin@example.com", clear: true },
          next: "step_click_btn",
        },
        step_click_btn: {
          id: "step_click_btn",
          type: "click",
          description: "Hacer click en Entrar",
          locator: {
            primary: { strategy: "role", value: "button[name='Entrar']", score: 90 },
            fallbacks: [],
          },
          params: { button: "left" },
          next: "step_extract",
        },
        step_extract: {
          id: "step_extract",
          type: "extract",
          description: "Extraer mensaje de bienvenida",
          locator: {
            primary: { strategy: "testid", value: "welcome-badge", score: 95 },
            fallbacks: [],
          },
          params: { extractType: "text", variable: "token" },
        },
      },
      edges: [
        { from: "step_nav", to: "step_type_user" },
        { from: "step_type_user", to: "step_click_btn" },
        { from: "step_click_btn", to: "step_extract" },
      ],
    };

    const code = exportToPlaywright(recipe, { testName: "Prueba de Exportación Login" });

    expect(code).toContain("import { test, expect, type Page, type Locator } from '@playwright/test';");
    expect(code).toContain("test(\"Prueba de Exportación Login\", async ({ page }) => {");
    expect(code).toContain("page.goto(\"https://example.com/login\"");
    expect(code).toContain("resolveLocator(page");
    expect(code).toContain("username-field");
    expect(code).toContain("button[name='Entrar']");
    expect(code).toContain("variables[\"token\"] = (await loc_step_extract.innerText()).trim();");
    expect(code).not.toContain("loc_step_type_user.press('Enter')");
  });

  it("exporta nodo type con opción pressEnter activada", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Búsqueda con Enter",
      entry: "step_search",
      nodes: {
        step_search: {
          id: "step_search",
          type: "type",
          description: "Escribir búsqueda y dar Enter",
          locator: {
            primary: { strategy: "css", value: "input#search", score: 90 },
            fallbacks: [],
          },
          params: { text: "playwright testing", clear: true, pressEnter: true },
        },
      },
      edges: [],
    };

    const code = exportToPlaywright(recipe);
    expect(code).toContain("await loc_step_search.fill(\"playwright testing\");");
    expect(code).toContain("await loc_step_search.press('Enter');");
  });

  it("soporta condiciones, esperas y capturas de pantalla", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Flujo con Espera y Screenshot",
      entry: "step_wait",
      nodes: {
        step_wait: {
          id: "step_wait",
          type: "waitFor",
          description: "Esperar a que cargue la red",
          params: { strategy: "networkIdle" },
          next: "step_shot",
        },
        step_shot: {
          id: "step_shot",
          type: "screenshot",
          description: "Tomar captura completa",
          params: { fullPage: true, name: "final_screenshot" },
        },
      },
      edges: [{ from: "step_wait", to: "step_shot" }],
    };

    const code = exportToPlaywright(recipe);
    expect(code).toContain("await page.waitForLoadState('networkidle'");
    expect(code).toContain("await page.screenshot({ path: \"final_screenshot.png\", fullPage: true });");
  });

  it("soporta bloque de bucle y bifurcación condicional", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Flujo con Loop",
      entry: "step_cond",
      nodes: {
        step_cond: {
          id: "step_cond",
          type: "condition",
          description: "Comprobar flag",
          params: {
            expression: "variables.flag === true",
            thenNodeId: "step_loop",
          },
        },
        step_loop: {
          id: "step_loop",
          type: "loop",
          description: "Iterar elementos",
          params: {
            collectionExpression: "variables.items",
            itemVariable: "currentItem",
            bodyEntryNodeId: "step_action",
            maxIterations: 5,
          },
        },
        step_action: {
          id: "step_action",
          type: "waitFor",
          description: "Esperar 500ms en cada vuelta",
          params: { strategy: "timeout", value: 500 },
        },
      },
      edges: [],
    };

    const code = exportToPlaywright(recipe);
    expect(code).toContain("if (Boolean(variables.flag === true)) {");
    expect(code).toContain("for (const item of (Array.isArray(variables.items) ? variables.items : [])) {");
    expect(code).toContain("variables[\"currentItem\"] = item;");
    expect(code).toContain("await page.waitForTimeout(500);");
  });

  it("exporta nodos de scroll por elemento y por coordenadas", () => {    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Flujo de Scroll",
      entry: "step_scroll_el",
      nodes: {
        step_scroll_el: {
          id: "step_scroll_el",
          type: "scroll",
          description: "Ubicar botón de compra",
          locator: {
            primary: { strategy: "testid", value: "buy-btn", score: 95 },
            fallbacks: [],
          },
          params: { mode: "element" },
          next: "step_scroll_px",
        },
        step_scroll_px: {
          id: "step_scroll_px",
          type: "scroll",
          description: "Desplazar 600px abajo",
          params: { mode: "coordinates", x: 0, y: 600, behavior: "smooth" },
        },
      },
      edges: [{ from: "step_scroll_el", to: "step_scroll_px" }],
    };

    const code = exportToPlaywright(recipe);
    expect(code).toContain("await loc_step_scroll_el.scrollIntoViewIfNeeded();");
    expect(code).toContain("window.scrollBy({ left, top, behavior }), { left: 0, top: 600, behavior: \"smooth\" }");
  });

  it("genera un bucle de reintentos cuando onError es retry", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Flujo con retry",
      entry: "step_nav",
      nodes: {
        step_nav: {
          id: "step_nav",
          type: "navigate",
          description: "Ir al sitio",
          params: { url: "https://example.com" },
          onError: "retry",
          retry: { maxAttempts: 4, delayMs: 250, backoff: "fixed" },
        },
      },
      edges: [],
    };

    const code = exportToPlaywright(recipe);

    expect(code).toContain("const maxAttempts_step_nav = 4;");
    expect(code).toContain("if (attempt_step_nav >= maxAttempts_step_nav) throw err;");
    expect(code).toContain("await page.waitForTimeout(250);");
    expect(code).toContain("page.goto(\"https://example.com\"");
  });

  it("genera bloques try/catch/finally y respeta la continuación", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Flujo protegido",
      entry: "tc",
      nodes: {
        tc: {
          id: "tc",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "try_1",
            catchEntryNodeId: "catch_1",
            finallyEntryNodeId: "finally_1",
            errorVariable: "error",
            rethrow: false,
          },
          next: "cont",
        },
        try_1: {
          id: "try_1",
          type: "navigate",
          description: "Try",
          params: { url: "https://example.com/try" },
          next: "cont",
        },
        catch_1: {
          id: "catch_1",
          type: "setVariable",
          description: "Catch",
          params: { name: "recuperado", expression: "true" },
          next: "cont",
        },
        finally_1: {
          id: "finally_1",
          type: "screenshot",
          description: "Finally",
          params: { fullPage: false, name: "finally" },
          next: "cont",
        },
        cont: {
          id: "cont",
          type: "navigate",
          description: "Continuación",
          params: { url: "https://example.com/cont" },
        },
      },
      edges: [],
    };

    const code = exportToPlaywright(recipe);

    expect(code).toContain("try {");
    expect(code).toContain("} catch (err) {");
    expect(code).toContain('variables["error"] = { message:');
    expect(code).toContain('variables["recuperado"] = true;');
    expect(code).toContain("} finally {");
    expect(code).toContain("page.goto(\"https://example.com/cont\"");
  });

  it("propaga el error con rethrow en el bloque catch", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Flujo con rethrow",
      entry: "tc",
      nodes: {
        tc: {
          id: "tc",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "try_1",
            catchEntryNodeId: "catch_1",
            rethrow: true,
          },
        },
        try_1: {
          id: "try_1",
          type: "navigate",
          description: "Try",
          params: { url: "https://example.com/try" },
        },
        catch_1: {
          id: "catch_1",
          type: "setVariable",
          description: "Catch",
          params: { name: "recuperado", expression: "true" },
        },
      },
      edges: [],
    };

    const code = exportToPlaywright(recipe);

    expect(code).toContain("} catch (err) {");
    expect(code).toContain("throw err;");
  });

  it("usa la arista sin etiqueta como continuación del loop e ignora la arista 'body'", () => {
    const recipe: RecipeDsl = {
      schema: "rpa/v1",
      name: "Loop con aristas etiquetadas",
      entry: "loop_1",
      nodes: {
        loop_1: {
          id: "loop_1",
          type: "loop",
          description: "Iterar",
          params: {
            collectionExpression: "variables.items",
            itemVariable: "item",
            bodyEntryNodeId: "body_1",
            maxIterations: 3,
          },
        },
        body_1: {
          id: "body_1",
          type: "waitFor",
          description: "Cuerpo",
          params: { strategy: "timeout", value: 100 },
        },
        cont: {
          id: "cont",
          type: "navigate",
          description: "Continuación",
          params: { url: "https://example.com/after-loop" },
        },
      },
      edges: [
        { from: "loop_1", to: "body_1", label: "body" },
        { from: "loop_1", to: "cont" },
      ],
    };

    const code = exportToPlaywright(recipe);
    const lines = code.split("\n");
    const continuationLine = lines.find((line) =>
      line.includes("https://example.com/after-loop")
    );

    expect(continuationLine).toBeDefined();
    expect(continuationLine?.startsWith("  await")).toBe(true);
    expect(code).toContain("for (const item of");
    expect(code).toContain("await page.waitForTimeout(100);");
  });
});
