import { describe, it, expect, vi } from "vitest";
import {
  createMissingTokenReporter,
  describeAvailableKeys,
} from "../src/engine/handlers/token-warnings.js";
import type { ExecutionContext } from "../src/engine/handlers/types.js";

describe("Token warnings", () => {
  const createContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => ({
    runId: "run-test",
    variables: {
      webhook: { body: { email: "lead@example.com" } },
      total: 3,
      steps: {
        extract_1: { output: "ok" },
      },
    },
    secrets: {},
    stepResults: {},
    ...overrides,
  });

  it("describe las claves disponibles incluyendo el primer nivel y las salidas de pasos", () => {
    const keys = describeAvailableKeys(createContext().variables);

    expect(keys).toContain("webhook");
    expect(keys).toContain("webhook.body");
    expect(keys).toContain("total");
    expect(keys).toContain("steps.extract_1.output");
    expect(keys).not.toContain("steps");
  });

  it("registra un único aviso con los tokens faltantes y las claves disponibles", () => {
    const warn = vi.fn();
    const ctx = createContext({ warn });

    createMissingTokenReporter("type_1", "type", ctx)([
      "steps.extract_2.output",
      "webhook.body.fecha",
    ]);

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, context] = warn.mock.calls[0];
    expect(message).toContain("Paso [type_1] (type)");
    expect(message).toContain("{{steps.extract_2.output}}");
    expect(message).toContain("{{webhook.body.fecha}}");
    expect(message).toContain("Claves disponibles");
    expect(context).toMatchObject({
      node_id: "type_1",
      node_type: "type",
      missing_tokens: ["steps.extract_2.output", "webhook.body.fecha"],
    });
  });

  it("no hace nada si el contexto no tiene logger o no hay tokens", () => {
    const ctx = createContext({ warn: undefined });
    expect(() => createMissingTokenReporter("type_1", "type", ctx)(["x"])).not.toThrow();

    const warn = vi.fn();
    createMissingTokenReporter("type_1", "type", createContext({ warn }))([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
