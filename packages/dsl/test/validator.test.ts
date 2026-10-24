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

  describe("retry", () => {
    const navigateWithRetry = (retry: unknown) => ({
      schema: "rpa/v1",
      entry: "node_1",
      nodes: {
        node_1: {
          id: "node_1",
          type: "navigate",
          description: "Ir a login",
          params: { url: "http://localhost" },
          onError: "retry",
          retry,
        },
      },
      edges: [],
    });

    it("acepta una política de reintentos explícita", () => {
      const result = validateRecipeDsl(
        navigateWithRetry({ maxAttempts: 4, delayMs: 250, backoff: "fixed" })
      );
      expect(result.success).toBe(true);
      expect(result.data?.nodes.node_1.retry).toEqual({
        maxAttempts: 4,
        delayMs: 250,
        backoff: "fixed",
      });
    });

    it("aplica los valores por defecto cuando la política viene vacía", () => {
      const result = validateRecipeDsl(navigateWithRetry({}));
      expect(result.success).toBe(true);
      expect(result.data?.nodes.node_1.retry).toEqual({
        maxAttempts: 3,
        delayMs: 1000,
        backoff: "exponential",
      });
    });

    it("permite onError 'retry' sin política explícita", () => {
      const result = validateRecipeDsl(navigateWithRetry(undefined));
      expect(result.success).toBe(true);
    });

    it("rechaza maxAttempts fuera de rango", () => {
      const result = validateRecipeDsl(
        navigateWithRetry({ maxAttempts: 11, delayMs: 100, backoff: "fixed" })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("maxAttempts"))).toBe(true);
    });

    it("rechaza delayMs negativo", () => {
      const result = validateRecipeDsl(
        navigateWithRetry({ maxAttempts: 2, delayMs: -1, backoff: "fixed" })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("delayMs"))).toBe(true);
    });
  });

  describe("tryCatch", () => {
    function tryCatchRecipe(overrides: {
      params?: Record<string, unknown>;
      next?: string;
      extraNodes?: Record<string, unknown>;
    } = {}) {
      return {
        schema: "rpa/v1",
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
              ...overrides.params,
            },
            next: overrides.next ?? "cont",
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
            type: "navigate",
            description: "Catch",
            params: { url: "https://example.com/catch" },
            next: "cont",
          },
          finally_1: {
            id: "finally_1",
            type: "navigate",
            description: "Finally",
            params: { url: "https://example.com/finally" },
            next: "cont",
          },
          cont: {
            id: "cont",
            type: "navigate",
            description: "Continuación",
            params: { url: "https://example.com/cont" },
          },
          ...overrides.extraNodes,
        },
        edges: [],
      };
    }

    it("valida un bloque try/catch/finally con continuación", () => {
      const result = validateRecipeDsl(tryCatchRecipe());
      expect(result.success).toBe(true);
      expect(result.data?.nodes.tc.type).toBe("tryCatch");
    });

    it("aplica los valores por defecto de errorVariable y rethrow", () => {
      const result = validateRecipeDsl(tryCatchRecipe());
      expect(result.success).toBe(true);
      const node = result.data?.nodes.tc;
      expect(node?.type).toBe("tryCatch");
      if (node?.type === "tryCatch") {
        expect(node.params.errorVariable).toBe("error");
        expect(node.params.rethrow).toBe(false);
      }
    });

    it("rechaza entradas inexistentes", () => {
      const result = validateRecipeDsl(
        tryCatchRecipe({ params: { catchEntryNodeId: "missing_catch" } })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("catchEntryNodeId"))).toBe(true);
    });

    it("rechaza que una rama empiece en el propio nodo tryCatch", () => {
      const result = validateRecipeDsl(
        tryCatchRecipe({ params: { tryEntryNodeId: "tc" } })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("propio nodo tryCatch"))).toBe(true);
    });

    it("rechaza bloques solapados", () => {
      const result = validateRecipeDsl(
        tryCatchRecipe({
          params: { catchEntryNodeId: "try_1" },
        })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("se solapa"))).toBe(true);
    });

    it("rechaza ciclos de 'next' dentro de una rama", () => {
      const result = validateRecipeDsl(
        tryCatchRecipe({
          extraNodes: {
            try_1: {
              id: "try_1",
              type: "navigate",
              description: "Try con ciclo",
              params: { url: "https://example.com/try" },
              next: "try_1",
            },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("ciclo de 'next'"))).toBe(true);
    });

    it("rechaza que la continuación coincida con el inicio de una rama", () => {
      const result = validateRecipeDsl(tryCatchRecipe({ next: "try_1" }));
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("continuación del tryCatch"))).toBe(true);
    });

    it("detecta solapamientos a través de un loop anidado en una rama", () => {
      const result = validateRecipeDsl(
        tryCatchRecipe({
          params: { tryEntryNodeId: "loop_inner", catchEntryNodeId: "body_x" },
          next: "cont",
          extraNodes: {
            loop_inner: {
              id: "loop_inner",
              type: "loop",
              description: "Loop anidado",
              params: {
                collectionExpression: "variables.items",
                itemVariable: "item",
                bodyEntryNodeId: "body_x",
                maxIterations: 3,
              },
              next: "cont",
            },
            body_x: {
              id: "body_x",
              type: "setVariable",
              description: "Cuerpo anidado",
              params: { name: "x", expression: "1" },
              next: "cont",
            },
          },
        })
      );

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("se solapa"))).toBe(true);
    });

    it("no marca como ciclo la reconvergencia de ramas de una condición anidada", () => {
      const result = validateRecipeDsl(
        tryCatchRecipe({
          params: { tryEntryNodeId: "cond_inner", catchEntryNodeId: "catch_1" },
          next: "cont",
          extraNodes: {
            cond_inner: {
              id: "cond_inner",
              type: "condition",
              description: "Condición anidada",
              params: {
                expression: "true",
                thenNodeId: "branch_a",
                elseNodeId: "branch_b",
              },
            },
            branch_a: {
              id: "branch_a",
              type: "setVariable",
              description: "Rama A",
              params: { name: "a", expression: "1" },
              next: "merge",
            },
            branch_b: {
              id: "branch_b",
              type: "setVariable",
              description: "Rama B",
              params: { name: "b", expression: "2" },
              next: "merge",
            },
            merge: {
              id: "merge",
              type: "setVariable",
              description: "Reconvergencia",
              params: { name: "m", expression: "3" },
              next: "cont",
            },
          },
        })
      );

      expect(result.success).toBe(true);
    });
  });

  describe("condition", () => {
    function conditionRecipe(overrides: {
      params?: Record<string, unknown>;
      next?: string;
      extraNodes?: Record<string, unknown>;
    } = {}) {
      return {
        schema: "rpa/v1",
        entry: "cond_1",
        nodes: {
          cond_1: {
            id: "cond_1",
            type: "condition",
            description: "Condición",
            params: {
              expression: "variables.ok",
              thenNodeId: "then_1",
              elseNodeId: "else_1",
              ...overrides.params,
            },
            ...(overrides.next ? { next: overrides.next } : {}),
          },
          then_1: {
            id: "then_1",
            type: "setVariable",
            description: "Rama then",
            params: { name: "branch", expression: "'then'" },
            next: "after",
          },
          else_1: {
            id: "else_1",
            type: "setVariable",
            description: "Rama else",
            params: { name: "branch", expression: "'else'" },
            next: "after",
          },
          after: {
            id: "after",
            type: "navigate",
            description: "Continuación",
            params: { url: "https://example.com/after" },
          },
          ...(overrides.extraNodes ?? {}),
        },
        edges: [],
      };
    }

    it("acepta la reconvergencia de then y else en un diamante", () => {
      const result = validateRecipeDsl(conditionRecipe({ next: "after" }));
      expect(result.success).toBe(true);
    });

    it("rechaza ramas inexistentes", () => {
      const result = validateRecipeDsl(
        conditionRecipe({ params: { elseNodeId: "missing_else" } })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("elseNodeId"))).toBe(true);
    });

    it("rechaza que una rama empiece en el propio nodo condition", () => {
      const result = validateRecipeDsl(
        conditionRecipe({ params: { thenNodeId: "cond_1" } })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("propio nodo condition"))).toBe(true);
    });

    it("rechaza ciclos de 'next' dentro de una rama", () => {
      const result = validateRecipeDsl(
        conditionRecipe({
          next: "after",
          extraNodes: {
            then_1: {
              id: "then_1",
              type: "setVariable",
              description: "Then con ciclo",
              params: { name: "branch", expression: "'then'" },
              next: "then_1",
            },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("ciclo de 'next'"))).toBe(true);
    });

    it("rechaza que una rama vuelva a entrar en el nodo condition", () => {
      const result = validateRecipeDsl(
        conditionRecipe({
          next: "after",
          extraNodes: {
            else_1: {
              id: "else_1",
              type: "setVariable",
              description: "Else que reentra",
              params: { name: "branch", expression: "'else'" },
              next: "cond_1",
            },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("vuelve a entrar"))).toBe(true);
    });
  });

  describe("loop", () => {
    function loopRecipe(overrides: {
      params?: Record<string, unknown>;
      next?: string;
      extraNodes?: Record<string, unknown>;
    } = {}) {
      return {
        schema: "rpa/v1",
        entry: "loop_1",
        nodes: {
          loop_1: {
            id: "loop_1",
            type: "loop",
            description: "Iterar elementos",
            params: {
              collectionExpression: "variables.items",
              itemVariable: "item",
              bodyEntryNodeId: "body_1",
              maxIterations: 5,
              ...overrides.params,
            },
            ...(overrides.next ? { next: overrides.next } : {}),
          },
          body_1: {
            id: "body_1",
            type: "setVariable",
            description: "Cuerpo",
            params: { name: "total", expression: "total + item" },
            next: overrides.next,
          },
          after: {
            id: "after",
            type: "setVariable",
            description: "Después del bucle",
            params: { name: "done", expression: "true" },
          },
          ...(overrides.extraNodes ?? {}),
        },
        edges: [],
      };
    }

    it("acepta un bucle con cuerpo y continuación válidos", () => {
      const result = validateRecipeDsl(loopRecipe({ next: "after" }));
      expect(result.success).toBe(true);
    });

    it("rechaza un cuerpo inexistente", () => {
      const result = validateRecipeDsl(
        loopRecipe({ params: { bodyEntryNodeId: "missing" } })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("bodyEntryNodeId"))).toBe(true);
    });

    it("rechaza que el cuerpo empiece en el propio nodo loop", () => {
      const result = validateRecipeDsl(
        loopRecipe({ params: { bodyEntryNodeId: "loop_1" } })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("propio nodo loop"))).toBe(true);
    });

    it("rechaza un ciclo de 'next' dentro del cuerpo", () => {
      const result = validateRecipeDsl(
        loopRecipe({
          next: "after",
          extraNodes: {
            body_1: {
              id: "body_1",
              type: "setVariable",
              description: "Cuerpo con ciclo",
              params: { name: "total", expression: "total + item" },
              next: "body_1",
            },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("ciclo de 'next'"))).toBe(true);
    });

    it("rechaza que el cuerpo vuelva a entrar en el nodo loop", () => {
      const result = validateRecipeDsl(
        loopRecipe({
          next: "after",
          extraNodes: {
            body_1: {
              id: "body_1",
              type: "setVariable",
              description: "Cuerpo que reentra",
              params: { name: "total", expression: "total + item" },
              next: "loop_1",
            },
          },
        })
      );
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("vuelve a entrar"))).toBe(true);
    });

    it("rechaza que la continuación coincida con el inicio del cuerpo", () => {
      const result = validateRecipeDsl(loopRecipe({ next: "body_1" }));
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes("continuación del loop"))).toBe(true);
    });
  });
});
