import { describe, expect, it } from "vitest";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import type { RecipeDsl } from "@rpa/dsl";
import { createRpaTemplateCompletionSource } from "../template-autocomplete";

const SAMPLE_DEFINITION: RecipeDsl = {
  schema: "rpa/v1",
  name: "Template Autocomplete Test",
  variables: [{ name: "ambiente", type: "string", defaultValue: "dev" }],
  secrets: ["API_KEY"],
  entry: "webhook_1myc9",
  edges: [],
  nodes: {
    webhook_1myc9: {
      id: "webhook_1myc9",
      type: "webhook",
      description: "Webhook inicial",
      params: { httpMethod: "POST", outputVariable: "webhook" },
    },
    httpRequest_7hu4k: {
      id: "httpRequest_7hu4k",
      type: "httpRequest",
      description: "Callback",
      params: { method: "POST", url: "https://example.com" },
    },
  },
};

const SAMPLE_WEBHOOK_PAYLOAD = {
  method: "POST",
  body: {
    raffle_id: 8425,
    lottery_id: 32,
    results: {
      raffle_code: 6800,
      result_number: "25918",
    },
  },
};

function runCompletion(doc: string, pos = doc.length): CompletionResult | null {
  const source = createRpaTemplateCompletionSource(() => ({
    definition: SAMPLE_DEFINITION,
    currentNodeId: "httpRequest_7hu4k",
    nodeOutputs: {},
    webhookPayload: SAMPLE_WEBHOOK_PAYLOAD,
  }));
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, pos, false);
  return source(ctx) as CompletionResult | null;
}

describe("createRpaTemplateCompletionSource", () => {
  it("sugiere raíces steps, variables, webhook y secret al abrir {{", () => {
    const res = runCompletion('{\n  "id": "{{');
    expect(res).not.toBeNull();
    const labels = res!.options.map((o) => o.label);
    expect(labels).toEqual(
      expect.arrayContaining(["steps", "variables", "webhook", "secret", "ambiente"])
    );
  });

  it("autocompleta nodos y propiedades anidadas del webhook tanto por steps.<id>.body como por output", () => {
    const resSteps = runCompletion('"{{steps.');
    expect(resSteps!.options.map((o) => o.label)).toContain("webhook_1myc9");
    expect(resSteps!.options.map((o) => o.label)).not.toContain("httpRequest_7hu4k");

    const resNode = runCompletion('"{{steps.webhook_1myc9.');
    expect(resNode!.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["output", "body", "method"])
    );

    const resBody = runCompletion('"{{steps.webhook_1myc9.body.');
    expect(resBody!.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["raffle_id", "lottery_id", "results"])
    );
    const raffleOpt = resBody!.options.find((o) => o.label === "raffle_id");
    expect(raffleOpt?.apply).toBe("raffle_id}}");

    const resultsOpt = resBody!.options.find((o) => o.label === "results");
    expect(resultsOpt?.apply).toBeUndefined();

    const resNested = runCompletion('"{{steps.webhook_1myc9.body.results.');
    expect(resNested!.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["raffle_code", "result_number"])
    );
  });

  it("autocompleta webhook.*, variables.* y secret.*", () => {
    const resWebhook = runCompletion('"{{webhook.body.');
    expect(resWebhook!.options.map((o) => o.label)).toContain("raffle_id");

    const resVars = runCompletion('"{{variables.');
    expect(resVars!.options.find((o) => o.label === "ambiente")?.apply).toBe("ambiente}}");

    const resSecrets = runCompletion('"{{secret.');
    expect(resSecrets!.options.find((o) => o.label === "API_KEY")?.apply).toBe("API_KEY}}");
  });
});
