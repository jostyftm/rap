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
});
