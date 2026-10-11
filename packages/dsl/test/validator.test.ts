import { describe, it, expect } from "vitest";
import { validateRecipeDsl, validateRecipeDslDetailed } from "../src/validator.js";

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

  it("valida un nodo de desplazamiento (scroll) correctamente", () => {
    const scrollRecipe = {
      schema: "rpa/v1",
      entry: "node_scroll",
      nodes: {
        node_scroll: {
          id: "node_scroll",
          type: "scroll",
          description: "Desplazar vista hacia footer",
          locator: {
            primary: { strategy: "css", value: "#footer", score: 85 },
            fallbacks: [],
          },
          params: {
            mode: "element",
            behavior: "smooth",
          },
        },
      },
      edges: [],
    };

    const result = validateRecipeDsl(scrollRecipe);
    expect(result.success).toBe(true);
    expect(result.data?.nodes.node_scroll.type).toBe("scroll");
  });

  it("permite scroll por coordenadas o bottom aun con locator vacío", () => {
    const scrollCoords = {
      schema: "rpa/v1",
      entry: "node_scroll",
      nodes: {
        node_scroll: {
          id: "node_scroll",
          type: "scroll",
          description: "Desplazar 500px hacia abajo",
          locator: {
            primary: { strategy: "css", value: "", score: 60 },
            fallbacks: [],
          },
          params: {
            mode: "coordinates",
            y: 500,
            behavior: "smooth",
          },
        },
      },
      edges: [],
    };

    const result = validateRecipeDsl(scrollCoords);
    expect(result.success).toBe(true);
  });

  it("rechaza scroll en modo element si el selector está vacío y retorna nodeIssues detallado", () => {
    const scrollEmptyElement = {
      schema: "rpa/v1",
      entry: "node_scroll",
      nodes: {
        node_scroll: {
          id: "node_scroll",
          type: "scroll",
          description: "Desplazar a elemento sin selector",
          locator: {
            primary: { strategy: "css", value: "", score: 60 },
            fallbacks: [],
          },
          params: {
            mode: "element",
            behavior: "smooth",
          },
        },
      },
      edges: [],
    };

    const result = validateRecipeDsl(scrollEmptyElement);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("Falta el selector CSS"))).toBe(true);
  });

  it("validateRecipeDslDetailed mapea issues por nodeId y campo", () => {
    const recipeWithErrors = {
      schema: "rpa/v1",
      entry: "scroll_1",
      nodes: {
        scroll_1: {
          id: "scroll_1",
          type: "scroll",
          description: "Desplazar",
          locator: {
            primary: { strategy: "css", value: "", score: 60 },
            fallbacks: [],
          },
          params: {
            mode: "element",
          },
        },
      },
      edges: [],
    };

    const detailed = validateRecipeDslDetailed(recipeWithErrors);
    expect(detailed.success).toBe(false);
    expect(detailed.nodeIssues["scroll_1"]).toBeDefined();
    expect(detailed.nodeIssues["scroll_1"].length).toBeGreaterThan(0);
    expect(detailed.nodeIssues["scroll_1"][0].field).toBe("locator.primary.value");
    expect(detailed.nodeIssues["scroll_1"][0].message).toContain("Falta el selector CSS");
  });
});
