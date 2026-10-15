import { describe, it, expect } from "vitest";
import {
  getNestedValue,
  resolveExpression,
  getAvailableExpressionTokens,
} from "../src/expressions.js";
import type { RecipeDsl } from "../src/types.js";

describe("Expression Evaluator", () => {
  describe("getNestedValue", () => {
    const sample = {
      user: {
        name: "Ada Lovelace",
        roles: ["admin", "dev"],
        meta: {
          score: 100,
        },
      },
      items: [
        { id: 1, title: "Item 1" },
        { id: 2, title: "Item 2" },
      ],
    };

    it("extracts shallow and deep properties with dot notation", () => {
      expect(getNestedValue(sample, "user.name")).toBe("Ada Lovelace");
      expect(getNestedValue(sample, "user.meta.score")).toBe(100);
      expect(getNestedValue(sample, "user.roles.0")).toBe("admin");
    });

    it("extracts array elements using bracket notation", () => {
      expect(getNestedValue(sample, "items[0].title")).toBe("Item 1");
      expect(getNestedValue(sample, "items[1].id")).toBe(2);
    });

    it("returns undefined for non-existent paths gracefully", () => {
      expect(getNestedValue(sample, "user.unknown.path")).toBeUndefined();
      expect(getNestedValue(sample, "nonexistent")).toBeUndefined();
      expect(getNestedValue(null, "any")).toBeUndefined();
    });
  });

  describe("resolveExpression", () => {
    const sampleRecipe: RecipeDsl = {
      name: "Test Recipe",
      entry: "node_1",
      variables: [
        { name: "baseUrl", type: "string", defaultValue: "https://example.com" },
        { name: "maxRetries", type: "number", defaultValue: 3 },
      ],
      secrets: ["API_KEY"],
      nodes: {
        node_1: {
          id: "node_1",
          type: "navigate",
          description: "Navegar al login",
          url: "https://example.com/login",
        },
        node_2: {
          id: "node_2",
          type: "webhook",
          description: "Entrada de Webhook",
          path: "/incoming",
        },
      },
    };

    const nodeOutputs = {
      node_1: {
        status: 200,
        currentUrl: "https://example.com/dashboard",
        user: { id: 42, role: "editor" },
      },
      node_2: {
        body: { customerId: "cust_99", amount: 1500 },
        headers: { "x-token": "secret-payload" },
        query: { ref: "google" },
      },
    };

    const secrets = {
      API_KEY: "sk_live_12345",
    };

    it("returns raw text if no interpolation exists", () => {
      const res = resolveExpression("Hello world", { definition: sampleRecipe });
      expect(res.hasError).toBe(false);
      expect(res.value).toBe("Hello world");
      expect(res.resolvedStr).toBe("Hello world");
    });

    it("resolves single exact token preserving object/primitive type", () => {
      const res = resolveExpression("{{steps.node_1.output.user}}", {
        definition: sampleRecipe,
        nodeOutputs,
      });
      expect(res.hasError).toBe(false);
      expect(res.value).toEqual({ id: 42, role: "editor" });
    });

    it("interpolates step outputs into strings", () => {
      const res = resolveExpression("Url is {{steps.node_1.output.currentUrl}} with code {{steps.node_1.output.status}}", {
        definition: sampleRecipe,
        nodeOutputs,
      });
      expect(res.hasError).toBe(false);
      expect(res.resolvedStr).toBe("Url is https://example.com/dashboard with code 200");
    });

    it("resolves webhook tokens", () => {
      const res = resolveExpression("Customer: {{webhook.body.customerId}} from {{webhook.query.ref}}", {
        definition: sampleRecipe,
        nodeOutputs,
      });
      expect(res.hasError).toBe(false);
      expect(res.resolvedStr).toBe("Customer: cust_99 from google");
    });

    it("resolves secrets and variables", () => {
      const res = resolveExpression("Bearer {{secret.API_KEY}} on {{variables.baseUrl}}", {
        definition: sampleRecipe,
        nodeOutputs,
        secrets,
      });
      expect(res.hasError).toBe(false);
      expect(res.resolvedStr).toBe("Bearer sk_live_12345 on https://example.com");
    });

    it("identifies missing tokens and marks error", () => {
      const res = resolveExpression("Value: {{steps.node_3.output.unknown}}", {
        definition: sampleRecipe,
        nodeOutputs,
      });
      expect(res.hasError).toBe(true);
      expect(res.missingTokens).toContain("steps.node_3.output.unknown");
      expect(res.error).toBeDefined();
    });
  });

  describe("getAvailableExpressionTokens", () => {
    const sampleRecipe: RecipeDsl = {
      name: "Token Test",
      entry: "node_1",
      variables: [{ name: "env", type: "string", defaultValue: "production" }],
      secrets: ["STRIPE_KEY"],
      nodes: {
        node_1: { id: "node_1", type: "navigate", description: "Home" },
        node_2: { id: "node_2", type: "webhook", description: "Hook" },
      },
    };

    const nodeOutputs = {
      node_1: { title: "Dashboard", count: 10 },
      node_2: { body: { ok: true } },
    };

    it("lists available tokens excluding active node and categorizing groups", () => {
      const tokens = getAvailableExpressionTokens(sampleRecipe, "node_1", nodeOutputs);

      // Node 1 should be excluded
      expect(tokens.some((t) => t.nodeId === "node_1")).toBe(false);

      // Webhook node should be present
      expect(tokens.some((t) => t.token === "{{webhook.body}}")).toBe(true);

      // Variables and secrets present
      expect(tokens.some((t) => t.token === "{{variables.env}}")).toBe(true);
      expect(tokens.some((t) => t.token === "{{secret.STRIPE_KEY}}")).toBe(true);
    });
  });
});
