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
