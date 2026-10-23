import { describe, it, expect, vi } from "vitest";
import type { Page } from "playwright";
import type {
  SetVariableNode,
  ConditionNode,
  LoopNode,
  NavigateNode,
  ScrollNode,
  WebhookNode,
  RecipeNode,
} from "@rpa/dsl";
import {
  executeNodeAction,
  defaultActionRegistry,
  ActionHandlerRegistry,
  type ExecutionContext,
} from "../src/engine/action-handlers.js";

describe("Action Handlers & Strategy Registry", () => {
  const createMockContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => ({
    runId: "run-test-123",
    variables: { user: "carlos", count: 10 },
    secrets: { token: "secret-token-abc" },
    stepResults: {},
    ...overrides,
  });

  const createMockPage = () => {
    return {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("dummy-png")),
    } as unknown as Page;
  };

  describe("ActionHandlerRegistry", () => {
    it("contiene todos los 13 tipos de nodos soportados por defecto", () => {
      const types = defaultActionRegistry.getAllTypes();
      expect(types).toContain("navigate");
      expect(types).toContain("click");
      expect(types).toContain("type");
      expect(types).toContain("select");
      expect(types).toContain("waitFor");
      expect(types).toContain("extract");
      expect(types).toContain("screenshot");
      expect(types).toContain("setVariable");
      expect(types).toContain("condition");
      expect(types).toContain("loop");
      expect(types).toContain("scroll");
      expect(types).toContain("webhook");
      expect(types).toContain("tryCatch");
      expect(types.length).toBe(13);
    });

    it("permite registrar y recuperar manejadores personalizados", async () => {
      const customRegistry = new ActionHandlerRegistry();
      const mockHandler = {
        type: "customAction" as any,
        execute: vi.fn().mockResolvedValue({ success: true, nextNodeId: "node-2" }),
      };

      customRegistry.register(mockHandler);
      expect(customRegistry.has("customAction")).toBe(true);
      expect(customRegistry.get("customAction" as any)).toBe(mockHandler);

      const ctx = createMockContext();
      const mockPage = createMockPage();
      const res = await executeNodeAction(
        mockPage,
        { id: "1", type: "customAction" } as any,
        ctx,
        customRegistry
      );

      expect(res.success).toBe(true);
      expect(res.nextNodeId).toBe("node-2");
    });

    it("lanza un error descriptivo si el tipo de nodo no está registrado", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const unknownNode = { id: "unknown-1", type: "unsupportedNode" } as unknown as RecipeNode;

      await expect(executeNodeAction(mockPage, unknownNode, ctx)).rejects.toThrow(
        "Tipo de nodo no soportado: unsupportedNode"
      );
    });
  });

  describe("Individual Handlers Execution", () => {
    it("setVariable ejecuta expresiones JSONata y muta ctx.variables", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: SetVariableNode = {
        id: "var-1",
        type: "setVariable",
        description: "Calcular total",
        params: {
          name: "total",
          expression: "count * 2.5",
        },
        next: "node-next",
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe(25);
      expect(ctx.variables.total).toBe(25);
      expect(result.nextNodeId).toBe("node-next");
    });

    it("condition evalúa expresión y bifurca a thenNodeId o elseNodeId", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();

      const conditionTrue: ConditionNode = {
        id: "cond-1",
        type: "condition",
        description: "Verificar si count > 5",
        params: {
          expression: "count > 5",
          thenNodeId: "path-true",
          elseNodeId: "path-false",
        },
      };

      const resTrue = await executeNodeAction(mockPage, conditionTrue, ctx);
      expect(resTrue.success).toBe(true);
      expect(resTrue.output).toBe(true);
      expect(resTrue.nextNodeId).toBe("path-true");

      const conditionFalse: ConditionNode = {
        id: "cond-2",
        type: "condition",
        description: "Verificar si count > 50",
        params: {
          expression: "count > 50",
          thenNodeId: "path-true",
          elseNodeId: "path-false",
        },
      };

      const resFalse = await executeNodeAction(mockPage, conditionFalse, ctx);
      expect(resFalse.success).toBe(true);
      expect(resFalse.output).toBe(false);
      expect(resFalse.nextNodeId).toBe("path-false");
    });

    it("loop retorna bodyEntryNodeId correctamente", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: LoopNode = {
        id: "loop-1",
        type: "loop",
        description: "Bucle for",
        params: {
          loopType: "for",
          variable: "i",
          from: 0,
          to: 5,
          bodyEntryNodeId: "step-inside-loop",
        },
        next: "after-loop",
      };

      const result = await executeNodeAction(mockPage, node, ctx);
      expect(result.success).toBe(true);
      expect(result.nextNodeId).toBe("step-inside-loop");
    });

    it("navigate interpola variables y secretos en la URL y llama a page.goto", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: NavigateNode = {
        id: "nav-1",
        type: "navigate",
        description: "Ir al perfil",
        params: {
          url: "https://example.com/user/{{user}}?auth={{secret.token}}",
          waitUntil: "networkidle",
        },
        timeout: 15000,
        next: "step-2",
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect(result.nextNodeId).toBe("step-2");
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com/user/carlos?auth=secret-token-abc",
        {
          waitUntil: "networkidle",
          timeout: 15000,
        }
      );
    });

    it("scroll en modo coordinates invoca page.evaluate con desplazamiento relativo", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: ScrollNode = {
        id: "scroll-1",
        type: "scroll",
        description: "Bajar 450px",
        params: {
          mode: "coordinates",
          x: 0,
          y: 450,
          behavior: "smooth",
        },
        next: "step-after-scroll",
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect(result.nextNodeId).toBe("step-after-scroll");
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("scroll en modo top invoca page.evaluate con scrollTo(top: 0)", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: ScrollNode = {
        id: "scroll-2",
        type: "scroll",
        description: "Volver arriba",
        params: {
          mode: "top",
          behavior: "auto",
        },
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("webhook inicializa payload y lo asigna a variables y output", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: WebhookNode = {
        id: "webhook-1",
        type: "webhook",
        description: "Recepción de webhook",
        params: {
          httpMethod: "POST",
          outputVariable: "myWebhook",
        },
        next: "step-process",
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect(result.nextNodeId).toBe("step-process");
      expect(ctx.variables.myWebhook).toBeDefined();
      expect((ctx.variables.myWebhook as any).method).toBe("POST");
      expect(result.output).toEqual(ctx.variables.myWebhook);
    });

    it("evalúa condición tipada según naturaleza del dato (string contains, number greater_than)", async () => {
      const ctx = createMockContext({
        variables: { userRole: "superadmin", totalOrder: 250 },
      });
      const mockPage = createMockPage();

      const conditionString: ConditionNode = {
        id: "cond-1",
        type: "condition",
        description: "Verificar rol",
        params: {
          expression: "true",
          dataType: "string",
          leftOperand: "{{userRole}}",
          operator: "contains",
          rightOperand: "admin",
          thenNodeId: "then-step",
          elseNodeId: "else-step",
        },
      };

      const resultString = await executeNodeAction(mockPage, conditionString, ctx);
      expect(resultString.success).toBe(true);
      expect(resultString.output).toBe(true);
      expect(resultString.nextNodeId).toBe("then-step");

      const conditionNumber: ConditionNode = {
        id: "cond-2",
        type: "condition",
        description: "Verificar monto",
        params: {
          expression: "true",
          dataType: "number",
          leftOperand: "{{totalOrder}}",
          operator: "less_than",
          rightOperand: "100",
          thenNodeId: "discount-step",
          elseNodeId: "normal-step",
        },
      };

      const resultNumber = await executeNodeAction(mockPage, conditionNumber, ctx);
      expect(resultNumber.success).toBe(true);
      expect(resultNumber.output).toBe(false);
      expect(resultNumber.nextNodeId).toBe("normal-step");
    });
  });
});
