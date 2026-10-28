import { describe, it, expect } from "vitest";
import {
  analyzeInitializerNodes,
  reconcileRecipeRoot,
  isInitializerNodeType,
  INITIALIZER_NODE_TYPES,
  type RecipeDsl,
} from "../src/index.js";

describe("Initializer Nodes & Root Detection", () => {
  it("reconoce 'navigate' y 'webhook' como tipos inicializadores por defecto", () => {
    expect(INITIALIZER_NODE_TYPES).toContain("navigate");
    expect(INITIALIZER_NODE_TYPES).toContain("webhook");
    expect(isInitializerNodeType("navigate")).toBe(true);
    expect(isInitializerNodeType("webhook")).toBe(true);
    expect(isInitializerNodeType("click")).toBe(false);
    expect(isInitializerNodeType("type")).toBe(false);
  });

  it("detecta el nodo inicializador raíz cuando no tiene aristas entrantes", () => {
    const dsl: RecipeDsl = {
      schema: "rpa/v1",
      entry: "node_other",
      nodes: {
        node_other: {
          id: "node_other",
          type: "setVariable",
          description: "Var",
          params: { name: "x", expression: "1" },
        },
        node_nav: {
          id: "node_nav",
          type: "navigate",
          description: "Navegar a login",
          params: { url: "https://example.com" },
          next: "node_click",
        },
        node_click: {
          id: "node_click",
          type: "click",
          description: "Click",
          locator: {
            primary: { strategy: "css", value: "#btn", score: 80 },
            fallbacks: [],
          },
          params: {},
        },
      },
      edges: [
        { from: "node_nav", to: "node_click" },
      ],
    };

    const analysis = analyzeInitializerNodes(dsl);
    expect(analysis.initializers).toHaveLength(1);
    expect(analysis.initializers[0].id).toBe("node_nav");
    expect(analysis.initializers[0].isRoot).toBe(true);
    expect(analysis.initializers[0].inDegree).toBe(0);
    expect(analysis.initializers[0].outDegree).toBe(1);
    expect(analysis.primaryRootId).toBe("node_nav");

    const reconciled = reconcileRecipeRoot(dsl);
    expect(reconciled.entry).toBe("node_nav");
  });

  it("distingue entre inicializador principal y secundario cuando existen múltiples inicializadores", () => {
    const dsl: RecipeDsl = {
      schema: "rpa/v1",
      entry: "webhook_start",
      nodes: {
        webhook_start: {
          id: "webhook_start",
          type: "webhook",
          description: "Trigger Webhook",
          params: { httpMethod: "POST" },
          next: "node_process",
        },
        nav_manual: {
          id: "nav_manual",
          type: "navigate",
          description: "Navegación secundaria de prueba",
          params: { url: "https://test.local" },
        },
        node_process: {
          id: "node_process",
          type: "setVariable",
          description: "Procesar",
          params: { name: "lead", expression: "done" },
        },
      },
      edges: [
        { from: "webhook_start", to: "node_process" },
      ],
    };

    const analysis = analyzeInitializerNodes(dsl);
    expect(analysis.initializers).toHaveLength(2);

    const webhookInit = analysis.initializers.find((i) => i.id === "webhook_start");
    const navInit = analysis.initializers.find((i) => i.id === "nav_manual");

    expect(webhookInit?.isRoot).toBe(true);
    expect(webhookInit?.isPrincipal).toBe(true);
    expect(navInit?.isRoot).toBe(true);
    expect(navInit?.isPrincipal).toBe(false);

    expect(analysis.primaryRootId).toBe("webhook_start");
  });

  it("no considera raíz a un inicializador que recibe una arista entrante", () => {
    const dsl: RecipeDsl = {
      schema: "rpa/v1",
      entry: "trigger_root",
      nodes: {
        trigger_root: {
          id: "trigger_root",
          type: "webhook",
          description: "Root Webhook",
          params: { httpMethod: "GET" },
          next: "nav_step",
        },
        nav_step: {
          id: "nav_step",
          type: "navigate",
          description: "Navegación intermedia disparada por el webhook",
          params: { url: "https://example.com" },
        },
      },
      edges: [
        { from: "trigger_root", to: "nav_step" },
      ],
    };

    const analysis = analyzeInitializerNodes(dsl);
    const navInit = analysis.initializers.find((i) => i.id === "nav_step");
    expect(navInit?.inDegree).toBe(1);
    expect(navInit?.isRoot).toBe(false);
    expect(analysis.primaryRootId).toBe("trigger_root");
  });

  it("cuenta las ramas de tryCatch como conexiones implícitas", () => {
    const dsl: RecipeDsl = {
      schema: "rpa/v1",
      entry: "tc",
      nodes: {
        tc: {
          id: "tc",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "try_nav",
            catchEntryNodeId: "catch_nav",
            finallyEntryNodeId: "finally_nav",
          },
          next: "cont_nav",
        },
        try_nav: {
          id: "try_nav",
          type: "navigate",
          description: "Try",
          params: { url: "https://example.com/try" },
          next: "cont_nav",
        },
        catch_nav: {
          id: "catch_nav",
          type: "navigate",
          description: "Catch",
          params: { url: "https://example.com/catch" },
          next: "cont_nav",
        },
        finally_nav: {
          id: "finally_nav",
          type: "navigate",
          description: "Finally",
          params: { url: "https://example.com/finally" },
          next: "cont_nav",
        },
        cont_nav: {
          id: "cont_nav",
          type: "navigate",
          description: "Continuación",
          params: { url: "https://example.com/cont" },
        },
      },
      edges: [],
    };

    const analysis = analyzeInitializerNodes(dsl);
    const tryNav = analysis.initializers.find((i) => i.id === "try_nav");
    const catchNav = analysis.initializers.find((i) => i.id === "catch_nav");
    const finallyNav = analysis.initializers.find((i) => i.id === "finally_nav");
    const contNav = analysis.initializers.find((i) => i.id === "cont_nav");

    expect(tryNav?.inDegree).toBe(1);
    expect(catchNav?.inDegree).toBe(1);
    expect(finallyNav?.inDegree).toBe(1);
    expect(contNav?.inDegree).toBeGreaterThanOrEqual(1);
    expect(tryNav?.isRoot).toBe(false);
  });

  it("cuenta el cuerpo del loop como conexión implícita", () => {
    const dsl: RecipeDsl = {
      schema: "rpa/v1",
      entry: "nav",
      nodes: {
        nav: {
          id: "nav",
          type: "navigate",
          description: "Inicio",
          params: { url: "https://example.com" },
          next: "loop_1",
        },
        loop_1: {
          id: "loop_1",
          type: "loop",
          description: "Iterar",
          params: {
            collectionExpression: "variables.items",
            itemVariable: "item",
            bodyEntryNodeId: "body_nav",
            maxIterations: 3,
          },
          next: "cont_nav",
        },
        body_nav: {
          id: "body_nav",
          type: "navigate",
          description: "Cuerpo",
          params: { url: "https://example.com/item" },
          next: "cont_nav",
        },
        cont_nav: {
          id: "cont_nav",
          type: "navigate",
          description: "Continuación",
          params: { url: "https://example.com/cont" },
        },
      },
      edges: [],
    };

    const analysis = analyzeInitializerNodes(dsl);
    const body = analysis.initializers.find((i) => i.id === "body_nav");

    expect(body?.inDegree).toBe(1);
    expect(body?.isRoot).toBe(false);
    expect(analysis.primaryRootId).toBe("nav");
  });

  it("repara automáticamente el entry cuando está vacío ('') o apunta a un nodo inexistente", () => {
    const dslBroken: RecipeDsl = {
      schema: "rpa/v1",
      entry: "",
      nodes: {
        step_1: {
          id: "step_1",
          type: "click",
          description: "Click",
          locator: { primary: { strategy: "css", value: "#btn", score: 80 }, fallbacks: [] },
          params: {},
          next: "step_2",
        },
        step_2: {
          id: "step_2",
          type: "type",
          description: "Type",
          locator: { primary: { strategy: "css", value: "#input", score: 80 }, fallbacks: [] },
          params: { text: "hola" },
        },
      },
      edges: [{ from: "step_1", to: "step_2" }],
    };

    const reconciled = reconcileRecipeRoot(dslBroken);
    expect(reconciled.entry).toBe("step_1");
  });

  it("mantiene el webhook como entry principal cuando el usuario lo define como principal", () => {
    const dslWithWebhook: RecipeDsl = {
      schema: "rpa/v1",
      entry: "webhook_start",
      nodes: {
        webhook_start: {
          id: "webhook_start",
          type: "webhook",
          description: "Webhook principal",
          params: { httpMethod: "POST" },
          next: "step_navigate",
        },
        step_navigate: {
          id: "step_navigate",
          type: "navigate",
          description: "Navegar",
          params: { url: "https://example.com" },
        },
      },
      edges: [{ from: "webhook_start", to: "step_navigate" }],
    };

    const reconciled = reconcileRecipeRoot(dslWithWebhook);
    expect(reconciled.entry).toBe("webhook_start");
  });
});
