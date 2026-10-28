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
  TypeNode,
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
    const mockLocator = {
      first: vi.fn().mockReturnThis(),
      waitFor: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      pressSequentially: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    };
    return {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("dummy-png")),
      locator: vi.fn().mockReturnValue(mockLocator),
      getByTestId: vi.fn().mockReturnValue(mockLocator),
      _mockLocator: mockLocator,
    } as unknown as Page & { _mockLocator: typeof mockLocator };
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

    it("webhook normaliza los parámetros crudos de la ejecución dentro de body", async () => {
      const ctx = createMockContext({
        variables: {},
        parameters: { fecha: "2026-10-23T10:00:00Z", email: "lead@example.com" },
      });
      const mockPage = createMockPage();
      const node: WebhookNode = {
        id: "webhook-raw",
        type: "webhook",
        description: "Webhook con payload crudo",
        params: { httpMethod: "POST", outputVariable: "webhook" },
        next: "step-process",
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect((result.output as any).body).toEqual({
        fecha: "2026-10-23T10:00:00Z",
        email: "lead@example.com",
      });
      expect((ctx.variables.webhook as any).body.email).toBe("lead@example.com");
    });

    it("webhook respeta un payload ya estructurado (method/path/query/body)", async () => {
      const payload = {
        method: "POST",
        path: "/api/v1/webhooks/recipes/token/trigger",
        headers: { "x-test": "1" },
        params: {},
        query: { foo: "bar" },
        body: { email: "structured@example.com" },
        timestamp: "2026-10-23T10:00:00Z",
      };
      const ctx = createMockContext({
        variables: { webhook: payload },
        parameters: { webhook: payload },
      });
      const mockPage = createMockPage();
      const node: WebhookNode = {
        id: "webhook-structured",
        type: "webhook",
        description: "Webhook estructurado",
        params: { httpMethod: "POST", outputVariable: "webhook" },
        next: "step-process",
      };

      const result = await executeNodeAction(mockPage, node, ctx);

      expect(result.success).toBe(true);
      expect((result.output as any).query).toEqual({ foo: "bar" });
      expect((result.output as any).body).toEqual({ email: "structured@example.com" });
      expect((result.output as any).headers["x-test"]).toBe("1");
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

    it("typeHandler escribe texto y presiona Enter si pressEnter es true", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: TypeNode = {
        id: "type-with-enter",
        type: "type",
        description: "Buscar con Enter",
        locator: {
          primary: { strategy: "testid", value: "search-box", score: 95 },
          fallbacks: [],
        },
        params: {
          text: "consulta de prueba",
          clear: true,
          pressEnter: true,
        },
      };

      const result = await executeNodeAction(mockPage, node, ctx);
      expect(result.success).toBe(true);
      expect(mockPage._mockLocator.fill).toHaveBeenCalledWith("consulta de prueba");
      expect(mockPage._mockLocator.press).toHaveBeenCalledWith("Enter");
    });

    it("typeHandler no presiona Enter si pressEnter es false o no está definido", async () => {
      const ctx = createMockContext();
      const mockPage = createMockPage();
      const node: TypeNode = {
        id: "type-no-enter",
        type: "type",
        description: "Solo escribir",
        locator: {
          primary: { strategy: "testid", value: "username", score: 95 },
          fallbacks: [],
        },
        params: {
          text: "usuario_normal",
          clear: true,
          pressEnter: false,
        },
      };

      const result = await executeNodeAction(mockPage, node, ctx);
      expect(result.success).toBe(true);
      expect(mockPage._mockLocator.fill).toHaveBeenCalledWith("usuario_normal");
      expect(mockPage._mockLocator.press).not.toHaveBeenCalled();
    });
  });
});
