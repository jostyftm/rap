import { describe, it, expect } from "vitest";
import { validateRecipeDsl } from "../src/validator.js";

describe("DSL Validator", () => {
  it("valida una receta lineal correctamente", () => {
    const validRecipe = {
      schema: "rpa/v1",
      name: "Flujo de Login",
      entry: "node_1",
      nodes: {
        node_1: {
          id: "node_1",
          type: "navigate",
          description: "Ir al formulario de login",
          params: { url: "http://localhost:8088/login" },
          next: "node_2",
        },
        node_2: {
          id: "node_2",
          type: "type",
          description: "Escribir usuario",
          locator: {
            primary: { strategy: "role", value: "textbox[name='Usuario']", score: 90 },
            fallbacks: [{ strategy: "css", value: "#username", score: 70 }],
          },
          params: { text: "admin", clear: true },
        },
      },
      edges: [{ from: "node_1", to: "node_2" }],
    };

    const result = validateRecipeDsl(validRecipe);
    expect(result.success).toBe(true);
    expect(result.data?.nodes.node_1.type).toBe("navigate");
  });

  it("rechaza recetas donde el nodo inicial no existe", () => {
    const invalidRecipe = {
      schema: "rpa/v1",
      entry: "node_inexistente",
      nodes: {
        node_1: {
          id: "node_1",
          type: "navigate",
          description: "Ir a login",
          params: { url: "http://localhost" },
        },
      },
      edges: [],
    };

    const result = validateRecipeDsl(invalidRecipe);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("entry"))).toBe(true);
  });

  it("rechaza bucles sin maxIterations definido", () => {
    const invalidLoop = {
      schema: "rpa/v1",
      entry: "node_1",
      nodes: {
        node_1: {
          id: "node_1",
          type: "loop",
          description: "Bucle infinito no permitido",
          params: {
            collectionExpression: "items",
            itemVariable: "item",
            bodyEntryNodeId: "node_1",
            // maxIterations omitido
          },
        },
      },
      edges: [],
    };

    const result = validateRecipeDsl(invalidLoop);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("maxIterations"))).toBe(true);
  });
});
