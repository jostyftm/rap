import { describe, it, expect } from "vitest";
import { validateRecipeDslDetailed } from "../src/validator.js";
import type { RecipeNode } from "../src/types.js";

const ALL_SYSTEM_NODE_TYPES: Array<RecipeNode["type"]> = [
  "navigate",
  "click",
  "type",
  "select",
  "waitFor",
  "extract",
  "screenshot",
  "setVariable",
  "condition",
  "loop",
  "scroll",
];

const MINIMAL_VALID_NODES: Record<RecipeNode["type"], any> = {
  navigate: {
    id: "node_navigate",
    type: "navigate",
    description: "Navegar",
    params: { url: "https://example.com" },
  },
  click: {
    id: "node_click",
    type: "click",
    description: "Clic",
    locator: {
      primary: { strategy: "css", value: "#btn", score: 90 },
      fallbacks: [],
    },
    params: {},
  },
  type: {
    id: "node_type",
    type: "type",
    description: "Escribir",
    locator: {
      primary: { strategy: "css", value: "#input", score: 90 },
      fallbacks: [],
    },
    params: { text: "hola" },
  },
  select: {
    id: "node_select",
    type: "select",
    description: "Seleccionar",
    locator: {
      primary: { strategy: "css", value: "#select", score: 90 },
      fallbacks: [],
    },
    params: { value: "opcion1" },
  },
  waitFor: {
    id: "node_waitFor",
    type: "waitFor",
    description: "Esperar",
    params: { strategy: "timeout", value: 5000 },
  },
  extract: {
    id: "node_extract",
    type: "extract",
    description: "Extraer",
    locator: {
      primary: { strategy: "css", value: ".price", score: 90 },
      fallbacks: [],
    },
    params: { variable: "extractedPrice", extractType: "text" },
  },
  screenshot: {
    id: "node_screenshot",
    type: "screenshot",
    description: "Captura",
    params: { fullPage: false },
  },
  setVariable: {
    id: "node_setVariable",
    type: "setVariable",
    description: "Asignar variable",
    params: { name: "count", expression: "10" },
  },
  condition: {
    id: "node_condition",
    type: "condition",
    description: "Condición",
    params: { expression: "true", thenNodeId: "target_step" },
  },
  loop: {
    id: "node_loop",
    type: "loop",
    description: "Bucle",
    params: {
      collectionExpression: "items",
      itemVariable: "item",
      bodyEntryNodeId: "target_step",
      maxIterations: 5,
    },
  },
  scroll: {
    id: "node_scroll",
    type: "scroll",
    description: "Desplazar",
    params: { mode: "bottom", behavior: "smooth" },
  },
};

describe("Schema Parity & Discriminator Integrity", () => {
  it("contiene exactamente los 11 tipos de nodos soportados por RPA Studio", () => {
    expect(ALL_SYSTEM_NODE_TYPES).toHaveLength(11);
    expect(ALL_SYSTEM_NODE_TYPES).toContain("scroll");
  });

  it("garantiza que NINGÚN tipo de nodo del sistema produzca 'Invalid discriminator value'", () => {
    for (const nodeType of ALL_SYSTEM_NODE_TYPES) {
      const sampleNode = {
        id: `test_${nodeType}`,
        type: nodeType,
        description: `Prueba de nodo ${nodeType}`,
        params: {},
      };

      const testDsl = {
        schema: "rpa/v1",
        name: `Test ${nodeType}`,
        entry: sampleNode.id,
        nodes: { [sampleNode.id]: sampleNode },
        edges: [],
      };

      const result = validateRecipeDslDetailed(testDsl);
      // Puede tener advertencias de parámetros obligatorios vacíos, pero NUNCA error de discriminador de tipo
      const discriminatorError = result.errors?.find(
        (e) =>
          e.includes("Invalid discriminator value") ||
          (e.includes(sampleNode.id) && e.includes(".type"))
      );

      expect(
        discriminatorError,
        `El tipo de nodo '${nodeType}' fue rechazado por el discriminador Zod: ${discriminatorError}`
      ).toBeUndefined();
    }
  });

  it("valida exitosamente la receta con cada uno de los 11 nodos válidos mínimos", () => {
    const targetStep = {
      id: "target_step",
      type: "navigate",
      description: "Destino",
      params: { url: "https://example.com" },
    };

    for (const nodeType of ALL_SYSTEM_NODE_TYPES) {
      const validNode = MINIMAL_VALID_NODES[nodeType];
      const testDsl = {
        schema: "rpa/v1",
        name: `Test Valido ${nodeType}`,
        entry: validNode.id,
        nodes: {
          [validNode.id]: validNode,
          target_step: targetStep,
        },
        edges: [{ from: validNode.id, to: targetStep.id }],
      };

      const result = validateRecipeDslDetailed(testDsl);
      expect(
        result.success,
        `El nodo '${nodeType}' no pasó la validación DSL: ${JSON.stringify(result.errors)}`
      ).toBe(true);
    }
  });

  it("rechaza de forma controlada tipos de nodos que genuinamente NO existen", () => {
    const fakeNode = {
      id: "fake_node",
      type: "unsupported_magic_node",
      description: "Nodo inexistente",
      params: {},
    };

    const testDsl = {
      schema: "rpa/v1",
      name: "Test Fake",
      entry: fakeNode.id,
      nodes: { [fakeNode.id]: fakeNode },
      edges: [],
    };

    const result = validateRecipeDslDetailed(testDsl);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid discriminator value"))).toBe(true);
  });
});
