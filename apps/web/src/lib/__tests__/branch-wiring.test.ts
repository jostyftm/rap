import { describe, expect, it } from "vitest";
import { applyEdgeToDefinition, connectionToEdge, edgeHandle } from "../branch-wiring";
import type { RecipeDsl } from "@rpa/dsl";

function baseDsl(): RecipeDsl {
  return {
    schema: "rpa/v1",
    name: "Test",
    entry: "cond",
    nodes: {
      cond: {
        id: "cond",
        type: "condition",
        description: "cond",
        params: {
          expression: "true",
          thenNodeId: "",
        },
      },
      thenNode: {
        id: "thenNode",
        type: "setVariable",
        description: "then",
        params: { name: "x", expression: "1" },
      },
      elseNode: {
        id: "elseNode",
        type: "setVariable",
        description: "else",
        params: { name: "x", expression: "2" },
      },
      loop: {
        id: "loop",
        type: "loop",
        description: "loop",
        params: {
          collectionExpression: "items",
          itemVariable: "item",
          bodyEntryNodeId: "",
          maxIterations: 10,
        },
      },
      bodyNode: {
        id: "bodyNode",
        type: "setVariable",
        description: "body",
        params: { name: "y", expression: "1" },
      },
    },
    edges: [],
  };
}

describe("branch wiring helpers", () => {
  it("convierte conexión con handles then/else/body/tryCatch en aristas DSL", () => {
    expect(connectionToEdge("cond", "thenNode", "then").condition).toBe("true");
    expect(connectionToEdge("cond", "elseNode", "else").condition).toBe("false");
    expect(connectionToEdge("loop", "bodyNode", "body").label).toBe("body");
    expect(connectionToEdge("tc", "try_1", "try").label).toBe("try");
    expect(connectionToEdge("tc", "catch_1", "catch").label).toBe("catch");
    expect(connectionToEdge("tc", "finally_1", "finally").label).toBe("finally");
    expect(connectionToEdge("a", "b", null).condition).toBeUndefined();
    expect(connectionToEdge("a", "b", null).label).toBeUndefined();
  });

  it("identifica el handle lógico de una arista", () => {
    expect(edgeHandle({ from: "a", to: "b", condition: "true" })).toBe("then");
    expect(edgeHandle({ from: "a", to: "b", condition: "false" })).toBe("else");
    expect(edgeHandle({ from: "a", to: "b", label: "body" })).toBe("body");
    expect(edgeHandle({ from: "a", to: "b", label: "try" })).toBe("try");
    expect(edgeHandle({ from: "a", to: "b", label: "catch" })).toBe("catch");
    expect(edgeHandle({ from: "a", to: "b", label: "finally" })).toBe("finally");
    expect(edgeHandle({ from: "a", to: "b" })).toBeUndefined();
  });

  it("aplica aristas de condition/loop y reemplaza la salida previa del mismo handle", () => {
    const dsl = baseDsl();
    const withThen = applyEdgeToDefinition(
      dsl,
      connectionToEdge("cond", "thenNode", "then")
    );
    expect(withThen).not.toBeNull();
    expect((withThen!.nodes.cond as any).params.thenNodeId).toBe("thenNode");
    expect(withThen!.edges).toHaveLength(1);

    const withElse = applyEdgeToDefinition(
      withThen!,
      connectionToEdge("cond", "elseNode", "else")
    );
    expect((withElse!.nodes.cond as any).params.elseNodeId).toBe("elseNode");

    const withLoopBody = applyEdgeToDefinition(
      withElse!,
      connectionToEdge("loop", "bodyNode", "body")
    );
    expect((withLoopBody!.nodes.loop as any).params.bodyEntryNodeId).toBe("bodyNode");

    // Reemplazar arista previa del mismo handle
    const replaced = applyEdgeToDefinition(
      withLoopBody!,
      connectionToEdge("cond", "elseNode", "else")
    );
    const condEdges = replaced!.edges.filter((e) => e.from === "cond");
    expect(condEdges).toHaveLength(2);
    expect(
      condEdges.filter((e) => edgeHandle(e) === "else").length
    ).toBe(1);
  });

  it("rechaza conexiones inválidas por tipo de nodo", () => {
    const dsl = baseDsl();
    expect(applyEdgeToDefinition(dsl, connectionToEdge("loop", "bodyNode", "then"))).toBeNull();
    expect(applyEdgeToDefinition(dsl, connectionToEdge("cond", "thenNode", "body"))).toBeNull();
    expect(
      applyEdgeToDefinition(dsl, connectionToEdge("cond", "thenNode", null))
    ).toBeNull();
  });
});
