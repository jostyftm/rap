import { describe, it, expect } from "vitest";
import { evaluateExpression, interpolateString } from "../src/evaluator/jsonata-evaluator.js";

describe("JSONata Evaluator & Interpolation", () => {
  it("interpola variables y secretos correctamente", () => {
    const template = "https://{{domain}}/login?user={{user}}&token={{secret.api_token}}";
    const result = interpolateString(
      template,
      { domain: "testsite.local", user: "operador" },
      { api_token: "xyz_secret_99" }
    );
    expect(result).toBe("https://testsite.local/login?user=operador&token=xyz_secret_99");
  });

  it("interpola rutas anidadas de steps, webhook y prefijos de variables", () => {
    const template = "User: {{variables.user}}, Step: {{steps.extract_1.output}}, Webhook: {{webhook.body.email}}, DirectStep: {{steps.webhook_1.body.email}}";
    const result = interpolateString(
      template,
      {
        user: "admin",
        steps: {
          extract_1: { output: "Item $49.99" },
          webhook_1: { output: { body: { email: "direct@example.com" } } },
        },
        webhook: { body: { email: "lead@example.com" } },
      }
    );
    expect(result).toBe("User: admin, Step: Item $49.99, Webhook: lead@example.com, DirectStep: direct@example.com");
  });

  it("serializa JSON si el valor interpolado es un objeto", () => {
    const template = "Payload: {{webhook.body}}";
    const result = interpolateString(
      template,
      {
        webhook: { body: { key: "val" } },
      }
    );
    expect(result).toBe('Payload: {"key":"val"}');
  });

  it("reporta los tokens sin resolver sin interrumpir la interpolación", () => {
    const missing: string[] = [];
    const result = interpolateString(
      "{{webhook.body.email}} - {{steps.extract_1.output}} - {{otro}}",
      { steps: { extract_1: { output: "ok" } } },
      {},
      { onMissingTokens: (tokens) => missing.push(...tokens) }
    );

    expect(result).toBe("{{webhook.body.email}} - ok - {{otro}}");
    expect(missing).toEqual(["webhook.body.email", "otro"]);
  });

  it("evalúa expresiones condicionales sin eval", async () => {
    const isGreater = await evaluateExpression("score > 80", { score: 95 });
    expect(isGreater).toBe(true);

    const isLower = await evaluateExpression("score > 80", { score: 50 });
    expect(isLower).toBe(false);
  });

  it("transforma datos con expresiones complejas", async () => {
    const transformed = await evaluateExpression("users[age >= 18].name", {
      users: [
        { name: "Ana", age: 22 },
        { name: "Juan", age: 15 },
        { name: "Pedro", age: 30 },
      ],
    });
    expect(transformed).toEqual(["Ana", "Pedro"]);
  });
});
