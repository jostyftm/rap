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

  it("exporta nodos de scroll por elemento y por coordenadas", () => {
    const recipe: RecipeDsl = {
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
});
