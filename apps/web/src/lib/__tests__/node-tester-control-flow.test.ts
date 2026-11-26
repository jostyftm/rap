import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeDsl } from "@rpa/dsl";
import { testRecipeNode, testSequentialNodes } from "../node-tester";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";

function setupLiveReady() {
  useLiveStore.setState({
    isOpen: true,
    status: "ready",
    proxyUrl: "http://localhost:8099/__rpa_proxy",
    kind: "embedded",
  });
}

function loadRecipe(definition: RecipeDsl) {
  useRecipeStore.getState().setRecipe({
    id: "recipe-control-test",
    name: definition.name || "Test Control Flow",
    version: 1,
    definition,
  });
  useRecipeStore.getState().clearSelection();
}

describe("node-tester control flow (tryCatch, condition, loop)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupLiveReady();
  });

  it("tryCatch sin error ejecuta la rama try, omite catch y guarda { caught: false, error: null }", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "try_block",
      nodes: {
        try_block: {
          id: "try_block",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "click_ok",
            catchEntryNodeId: "extract_toast",
            errorVariable: "error",
            rethrow: false,
          },
          next: "after_node",
        },
        click_ok: {
          id: "click_ok",
          type: "click",
          description: "Clic tabla",
          locator: {
            primary: { strategy: "css", value: ".row-btn", score: 80 },
            fallbacks: [],
          },
          params: { button: "left" },
          next: "after_node",
        },
        extract_toast: {
          id: "extract_toast",
          type: "extract",
          description: "Extraer toast",
          locator: {
            primary: { strategy: "css", value: ".p-toast-detail", score: 80 },
            fallbacks: [],
          },
          params: { extractType: "text", variable: "extractedData" },
        },
        after_node: {
          id: "after_node",
          type: "setVariable",
          description: "Después",
          params: { name: "done", expression: "true" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    const executed: string[] = [];
    vi.spyOn(useLiveStore.getState(), "exec").mockImplementation(async (node) => {
      executed.push(node.id);
      return { ok: true, nodeId: node.id, output: "clicked" };
    });

    const res = await testRecipeNode(def.nodes.try_block);
    expect(res.ok).toBe(true);
    expect(res.output).toEqual({ caught: false, error: null });
    expect(executed).toEqual(["click_ok"]);
    expect(useRecipeStore.getState().nodeOutputs.try_block).toEqual({
      caught: false,
      error: null,
    });
    expect(useRecipeStore.getState().nodeOutputs.after_node).toBeUndefined();
  });

  it("tryCatch con fallo en try captura error, ejecuta catch (extract -> setVariable) y finally", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "try_block",
      nodes: {
        try_block: {
          id: "try_block",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "click_fail",
            catchEntryNodeId: "extract_toast",
            finallyEntryNodeId: "finally_var",
            errorVariable: "error",
            rethrow: false,
          },
        },
        click_fail: {
          id: "click_fail",
          type: "click",
          description: "Clic tabla",
          locator: {
            primary: { strategy: "css", value: ".missing-btn", score: 80 },
            fallbacks: [],
          },
          params: { button: "left" },
        },
        extract_toast: {
          id: "extract_toast",
          type: "extract",
          description: "Extraer toast",
          locator: {
            primary: { strategy: "css", value: "p-toast .p-toast-detail", score: 80 },
            fallbacks: [],
          },
          params: { extractType: "text", variable: "extractedData" },
          next: "save_msg",
        },
        save_msg: {
          id: "save_msg",
          type: "setVariable",
          description: "Formatear resumen",
          params: {
            name: "resumen",
            expression: "{{variables.extractedData}} | {{variables.error.nodeId}}",
          },
        },
        finally_var: {
          id: "finally_var",
          type: "setVariable",
          description: "Limpieza",
          params: { name: "cleaned", expression: "true" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    const executed: string[] = [];
    vi.spyOn(useLiveStore.getState(), "exec").mockImplementation(async (node) => {
      executed.push(node.id);
      if (node.id === "click_fail") {
        return { ok: false, nodeId: node.id, error: "Timeout 2500ms exceeded" };
      }
      if (node.id === "extract_toast") {
        return {
          ok: true,
          nodeId: node.id,
          output: "El servicio no se encuentra disponible",
        };
      }
      return { ok: true, nodeId: node.id };
    });

    const res = await testRecipeNode(def.nodes.try_block);
    expect(res.ok).toBe(true);
    expect(executed).toEqual(["click_fail", "extract_toast"]);
    expect(res.output).toEqual({
      caught: true,
      error: {
        message: "Timeout 2500ms exceeded",
        nodeId: "click_fail",
        type: "NodeExecutionError",
      },
      catchOutput: "El servicio no se encuentra disponible | click_fail",
    });
    expect(useRecipeStore.getState().nodeExecStatuses.click_fail).toBe("error");
    expect(useRecipeStore.getState().nodeExecErrors.click_fail).toBe(
      "Timeout 2500ms exceeded"
    );
    expect(useRecipeStore.getState().nodeExecStatuses.extract_toast).toBe("success");
    expect(useRecipeStore.getState().nodeExecStatuses.try_block).toBe("success");
    expect(useRecipeStore.getState().nodeOutputs.extract_toast).toBe(
      "El servicio no se encuentra disponible"
    );
    expect(useRecipeStore.getState().nodeOutputs.save_msg).toBe(
      "El servicio no se encuentra disponible | click_fail"
    );
    expect(useRecipeStore.getState().nodeOutputs.finally_var).toBe(true);
  });

  it("al re-ejecutar tryCatch con éxito en try reinicia el estado visual previo del catch a idle", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "try_block",
      nodes: {
        try_block: {
          id: "try_block",
          type: "tryCatch",
          description: "Bloque protegido",
          params: {
            tryEntryNodeId: "click_btn",
            catchEntryNodeId: "extract_toast",
            errorVariable: "error",
            rethrow: false,
          },
        },
        click_btn: {
          id: "click_btn",
          type: "click",
          description: "Clic tabla",
          locator: {
            primary: { strategy: "css", value: ".row-btn", score: 80 },
            fallbacks: [],
          },
          params: { button: "left" },
        },
        extract_toast: {
          id: "extract_toast",
          type: "extract",
          description: "Extraer toast",
          locator: {
            primary: { strategy: "css", value: "p-toast .p-toast-detail", score: 80 },
            fallbacks: [],
          },
          params: { extractType: "text", variable: "extractedData" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    let shouldFail = true;
    vi.spyOn(useLiveStore.getState(), "exec").mockImplementation(async (node) => {
      if (node.id === "click_btn" && shouldFail) {
        return { ok: false, nodeId: node.id, error: "No encontrado" };
      }
      if (node.id === "extract_toast") {
        return { ok: true, nodeId: node.id, output: "Toast de error" };
      }
      return { ok: true, nodeId: node.id, output: "clicked" };
    });

    await testRecipeNode(def.nodes.try_block);
    expect(useRecipeStore.getState().nodeExecStatuses.click_btn).toBe("error");
    expect(useRecipeStore.getState().nodeExecStatuses.extract_toast).toBe("success");

    shouldFail = false;
    await testRecipeNode(def.nodes.try_block);
    expect(useRecipeStore.getState().nodeExecStatuses.click_btn).toBe("success");
    expect(useRecipeStore.getState().nodeExecErrors.click_btn).toBe("");
    expect(useRecipeStore.getState().nodeExecStatuses.extract_toast).toBe("idle");
  });

  it("tryCatch con rethrow=true ejecuta catch y finally pero devuelve ok=false", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "try_block",
      nodes: {
        try_block: {
          id: "try_block",
          type: "tryCatch",
          description: "Try con rethrow",
          params: {
            tryEntryNodeId: "click_fail",
            catchEntryNodeId: "catch_log",
            finallyEntryNodeId: "finally_log",
            errorVariable: "error",
            rethrow: true,
          },
        },
        click_fail: {
          id: "click_fail",
          type: "click",
          description: "Clic fallido",
          locator: {
            primary: { strategy: "css", value: ".missing", score: 70 },
            fallbacks: [],
          },
          params: { button: "left" },
        },
        catch_log: {
          id: "catch_log",
          type: "setVariable",
          description: "Guardar error",
          params: { name: "errCopy", expression: "{{variables.error.message}}" },
        },
        finally_log: {
          id: "finally_log",
          type: "setVariable",
          description: "Finally",
          params: { name: "fin", expression: "done" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    vi.spyOn(useLiveStore.getState(), "exec").mockResolvedValue({
      ok: false,
      nodeId: "click_fail",
      error: "Elemento ausente",
    });

    const res = await testRecipeNode(def.nodes.try_block);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Elemento ausente");
    expect(useRecipeStore.getState().nodeOutputs.catch_log).toBe("Elemento ausente");
    expect(useRecipeStore.getState().nodeOutputs.finally_log).toBe("done");
  });

  it("testSequentialNodes no duplica ni ejecuta catch cuando se seleccionan [tryCatch, clickTry, extractCatch]", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "try_block",
      nodes: {
        try_block: {
          id: "try_block",
          type: "tryCatch",
          description: "TryCatch deduplicación",
          params: {
            tryEntryNodeId: "click_try",
            catchEntryNodeId: "extract_catch",
            errorVariable: "error",
            rethrow: false,
          },
        },
        click_try: {
          id: "click_try",
          type: "click",
          description: "Clic OK",
          locator: {
            primary: { strategy: "css", value: ".ok", score: 80 },
            fallbacks: [],
          },
          params: { button: "left" },
        },
        extract_catch: {
          id: "extract_catch",
          type: "extract",
          description: "Extraer toast",
          locator: {
            primary: { strategy: "css", value: ".toast", score: 80 },
            fallbacks: [],
          },
          params: { extractType: "text", variable: "toast" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    const executed: string[] = [];
    vi.spyOn(useLiveStore.getState(), "exec").mockImplementation(async (node) => {
      executed.push(node.id);
      return { ok: true, nodeId: node.id, output: "ok" };
    });

    const res = await testSequentialNodes(
      ["try_block", "click_try", "extract_catch"],
      { delayMs: 0 }
    );
    expect(res.completed).toBe(true);
    expect(executed).toEqual(["click_try"]);
  });

  it("condition ejecuta únicamente la rama verdadera o la falsa según corresponda", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "cond_1",
      variables: [{ name: "estado", type: "string", defaultValue: "activo" }],
      nodes: {
        cond_1: {
          id: "cond_1",
          type: "condition",
          description: "Evaluar estado",
          params: {
            dataType: "string",
            operator: "equals",
            leftOperand: "{{variables.estado}}",
            rightOperand: "activo",
            expression: 'variables.estado = "activo"',
            thenNodeId: "then_step",
            elseNodeId: "else_step",
          },
        },
        then_step: {
          id: "then_step",
          type: "setVariable",
          description: "Rama THEN",
          params: { name: "branch", expression: "THEN" },
        },
        else_step: {
          id: "else_step",
          type: "setVariable",
          description: "Rama ELSE",
          params: { name: "branch", expression: "ELSE" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    const res = await testRecipeNode(def.nodes.cond_1);
    expect(res.ok).toBe(true);
    expect(useRecipeStore.getState().nodeOutputs.then_step).toBe("THEN");
    expect(useRecipeStore.getState().nodeOutputs.else_step).toBeUndefined();
  });

  it("condition evalúa datos nulos, indefinidos y vacíos sin confundir tokens faltantes ni 0/false", async () => {
    const condNullNode = {
      id: "cond_null",
      type: "condition" as const,
      description: "Verificar nulo o vacío",
      params: {
        dataType: "exists" as const,
        operator: "is_null" as const,
        leftOperand: "{{variables.nulo}}",
        expression: "variables.nulo = null",
        thenNodeId: "then_step",
        elseNodeId: "else_step",
      },
    };
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "cond_null",
      variables: [
        { name: "nulo", type: "string", defaultValue: null },
        { name: "sinDefault", type: "string" },
        { name: "espacios", type: "string", defaultValue: "   " },
        { name: "listaVacia", type: "array", defaultValue: [] },
        { name: "objetoVacio", type: "object", defaultValue: {} },
        { name: "cero", type: "number", defaultValue: 0 },
        { name: "falso", type: "boolean", defaultValue: false },
      ],
      nodes: {
        cond_null: condNullNode,
        then_step: {
          id: "then_step",
          type: "setVariable",
          description: "Rama THEN",
          params: { name: "branch", expression: "THEN" },
        },
        else_step: {
          id: "else_step",
          type: "setVariable",
          description: "Rama ELSE",
          params: { name: "branch", expression: "ELSE" },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    const resNull = await testRecipeNode(condNullNode);
    expect(resNull.ok).toBe(true);
    expect((resNull.output as any).cumpleCondicion).toBe(true);
    expect((resNull.output as any).comparacion).toBe("null [is_null]");

    const resMissing = await testRecipeNode({
      ...condNullNode,
      params: { ...condNullNode.params, leftOperand: "{{variables.sinDefault}}" },
    });
    expect((resMissing.output as any).cumpleCondicion).toBe(true);
    expect((resMissing.output as any).comparacion).toBe("undefined [is_null]");

    const resSpaces = await testRecipeNode({
      ...condNullNode,
      params: {
        ...condNullNode.params,
        dataType: "string",
        operator: "is_empty",
        leftOperand: "{{variables.espacios}}",
      },
    });
    expect((resSpaces.output as any).cumpleCondicion).toBe(true);

    const resEmptyArr = await testRecipeNode({
      ...condNullNode,
      params: {
        ...condNullNode.params,
        dataType: "array",
        operator: "is_null_or_empty",
        leftOperand: "{{variables.listaVacia}}",
      },
    });
    expect((resEmptyArr.output as any).cumpleCondicion).toBe(true);

    const resEmptyObj = await testRecipeNode({
      ...condNullNode,
      params: {
        ...condNullNode.params,
        operator: "is_null_or_empty",
        leftOperand: "{{variables.objetoVacio}}",
      },
    });
    expect((resEmptyObj.output as any).cumpleCondicion).toBe(true);

    const resZero = await testRecipeNode({
      ...condNullNode,
      params: {
        ...condNullNode.params,
        operator: "is_not_null_or_empty",
        leftOperand: "{{variables.cero}}",
      },
    });
    expect((resZero.output as any).cumpleCondicion).toBe(true);

    const resFalse = await testRecipeNode({
      ...condNullNode,
      params: {
        ...condNullNode.params,
        operator: "is_not_null_or_empty",
        leftOperand: "{{variables.falso}}",
      },
    });
    expect((resFalse.output as any).cumpleCondicion).toBe(true);
  });

  it("loop itera sobre una colección respetando maxIterations y exponiendo itemVariable", async () => {
    const def: RecipeDsl = {
      schema: "rpa/v1",
      entry: "loop_1",
      nodes: {
        loop_1: {
          id: "loop_1",
          type: "loop",
          description: "Bucle filas",
          params: {
            collectionExpression: '["a", "b", "c", "d"]',
            itemVariable: "fila",
            bodyEntryNodeId: "body_js",
            maxIterations: 2,
          },
        },
        body_js: {
          id: "body_js",
          type: "javascript",
          description: "Acumular fila",
          params: {
            mode: "sandbox",
            code: 'const acc = Array.isArray(variables.seen) ? variables.seen : []; acc.push(variables.fila); setVariable("seen", acc); return acc;',
            outputVariable: "seen",
          },
        },
      },
      edges: [],
    };
    loadRecipe(def);

    const res = await testRecipeNode(def.nodes.loop_1);
    expect(res.ok).toBe(true);
    expect(res.output).toEqual({ iterations: 2, truncated: true });
    expect(useRecipeStore.getState().nodeOutputs.body_js).toEqual(["a", "b"]);
  });
});
