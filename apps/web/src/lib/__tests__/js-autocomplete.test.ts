import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { RecipeDsl } from "@rpa/dsl";
import {
  collectAvailableVariables,
  createRpaJsCompletionSource,
  type JsAutocompleteContext,
} from "../js-autocomplete";

function createSampleRecipe(): RecipeDsl {
  return {
    schema: "rpa/v1",
    name: "Test Autocomplete Recipe",
    variables: [
      { name: "apiToken", type: "string", defaultValue: "abc" },
      { name: "config", type: "object", defaultValue: { retries: 3, env: "prod" } },
    ],
    secrets: ["SUPER_SECRET_KEY"],
    entry: "hook_1",
    edges: [],
    nodes: {
      hook_1: {
        id: "hook_1",
        type: "webhook",
        description: "Trigger webhook",
        params: { path: "/hook", httpMethod: "POST", outputVariable: "payload" },
        next: "set_1",
      },
      set_1: {
        id: "set_1",
        type: "setVariable",
        description: "Set cliente",
        params: { name: "cliente", expression: "variables.apiToken" },
        next: "js_1",
      },
      js_1: {
        id: "js_1",
        type: "javascript",
        description: "Run JS",
        params: {
          mode: "sandbox",
          code: "return input;",
          outputVariable: "resumenJs",
        },
      },
      http_1: {
        id: "http_1",
        type: "httpRequest",
        description: "HTTP",
        params: {
          method: "GET",
          url: "https://api.example.com/orders",
          responseType: "json",
          outputVariable: "ordenApi",
        },
      },
    },
  };
}

function queryCompletions(
  doc: string,
  ctx: JsAutocompleteContext,
  explicit = false
): CompletionResult | null {
  const source = createRpaJsCompletionSource(() => ctx);
  const state = EditorState.create({ doc });
  const completionContext = new CompletionContext(state, doc.length, explicit);
  return source(completionContext) as CompletionResult | null;
}

describe("js-autocomplete", () => {
  it("recolecta variables globales y generadas por nodos sin exponer secretos", () => {
    const vars = collectAvailableVariables(createSampleRecipe(), {
      set_1: { nombre: "Ana", activo: true },
    });
    const names = vars.map((v) => v.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "apiToken",
        "config",
        "payload",
        "cliente",
        "resumenJs",
        "ordenApi",
      ])
    );
    expect(names).not.toContain("SUPER_SECRET_KEY");

    const httpStepFields = queryCompletions("steps.http_1.output.", {
      definition: createSampleRecipe(),
      currentNodeId: "js_1",
      nodeOutputs: {},
      mode: "sandbox",
    });
    expect(httpStepFields?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["status", "ok", "headers", "data"])
    );
  });

  it("completa variables.* y propiedades anidadas de objetos", () => {
    const ctx: JsAutocompleteContext = {
      definition: createSampleRecipe(),
      currentNodeId: "js_1",
      nodeOutputs: {
        set_1: { usuario: { id: 42, email: "ana@test.com" } },
      },
      mode: "sandbox",
    };

    const rootVars = queryCompletions("variables.", ctx);
    expect(rootVars?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["apiToken", "config", "payload", "cliente", "resumenJs"])
    );

    const nested = queryCompletions("variables.cliente.usuario.", ctx);
    expect(nested?.options.map((o) => o.label)).toEqual(expect.arrayContaining(["id", "email"]));
  });

  it("completa steps.<nodeId>.output.* excluyendo el nodo actual", () => {
    const ctx: JsAutocompleteContext = {
      definition: createSampleRecipe(),
      currentNodeId: "js_1",
      nodeOutputs: {
        hook_1: { body: { orderId: "ORD-99", total: 150 } },
      },
      mode: "sandbox",
    };

    const stepIds = queryCompletions("steps.", ctx);
    const idLabels = stepIds?.options.map((o) => o.label) ?? [];
    expect(idLabels).toContain("hook_1");
    expect(idLabels).toContain("set_1");
    expect(idLabels).not.toContain("js_1");

    const outputMember = queryCompletions("steps.hook_1.", ctx);
    expect(outputMember?.options.map((o) => o.label)).toEqual(["output"]);

    const nestedOutput = queryCompletions("steps.hook_1.output.body.", ctx);
    expect(nestedOutput?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["orderId", "total"])
    );
  });

  it("completa input.* con payload de webhook en vivo o estructura por defecto", () => {
    const ctx: JsAutocompleteContext = {
      definition: createSampleRecipe(),
      currentNodeId: "js_1",
      nodeOutputs: {},
      webhookPayload: {
        method: "POST",
        path: "/webhook",
        body: { pedido: { folio: "F-123" } },
      },
      mode: "sandbox",
    };

    const inputRoot = queryCompletions("input.", ctx);
    expect(inputRoot?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["webhook", "pedido"])
    );

    const nestedWebhook = queryCompletions("input.webhook.body.pedido.", ctx);
    expect(nestedWebhook?.options.map((o) => o.label)).toEqual(["folio"]);
  });

  it("separa sugerencias DOM únicamente para mode='browser'", () => {
    const baseCtx: JsAutocompleteContext = {
      definition: createSampleRecipe(),
      currentNodeId: "js_1",
      nodeOutputs: {},
      mode: "sandbox",
    };

    const sandboxRoot = queryCompletions("", baseCtx, true);
    const sandboxLabels = sandboxRoot?.options.map((o) => o.label) ?? [];
    expect(sandboxLabels).toEqual(
      expect.arrayContaining(["variables", "steps", "input", "setVariable", "mapItems"])
    );
    expect(sandboxLabels).not.toContain("document");
    expect(queryCompletions("document.", baseCtx)).toBeNull();

    const browserCtx: JsAutocompleteContext = { ...baseCtx, mode: "browser" };
    const browserRoot = queryCompletions("", browserCtx, true);
    const browserLabels = browserRoot?.options.map((o) => o.label) ?? [];
    expect(browserLabels).toEqual(
      expect.arrayContaining(["document", "window", "queryAll", "extractTable"])
    );

    const docMembers = queryCompletions("document.", browserCtx);
    expect(docMembers?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["querySelector", "querySelectorAll", "title", "URL"])
    );
  });
});
