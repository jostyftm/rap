import { describe, it, expect } from "vitest";
import {
  extractWebhookSlug,
  buildProductionWebhookPath,
  buildTestWebhookPath,
  buildProductionWebhookUrl,
  buildTestWebhookUrl,
} from "../webhook-url";

describe("webhook-url helpers", () => {
  it("extrae el slug limpio independientemente del prefijo heredado o barra", () => {
    expect(extractWebhookSlug("/api/v1/webhooks/pedidos")).toBe("pedidos");
    expect(extractWebhookSlug("/api/v1/webhooks-test/pedidos")).toBe("pedidos");
    expect(extractWebhookSlug("webhooks/clientes/alta")).toBe("clientes/alta");
    expect(extractWebhookSlug("mi-hook")).toBe("mi-hook");
    expect(extractWebhookSlug("", "webhook_2")).toBe("webhook_2");
    expect(extractWebhookSlug("/api/v1/webhooks/", "webhook_3")).toBe("webhook_3");
  });

  it("construye rutas y URLs aisladas de producción y prueba", () => {
    expect(buildProductionWebhookPath("/api/v1/webhooks/pedidos")).toBe("/api/v1/webhooks/pedidos");
    expect(buildProductionWebhookPath("/api/v1/webhooks-test/pedidos")).toBe("/api/v1/webhooks/pedidos");
    expect(buildTestWebhookPath("/api/v1/webhooks/pedidos")).toBe("/api/v1/webhooks-test/pedidos");

    expect(buildProductionWebhookUrl("pedidos")).toMatch(/\/api\/v1\/webhooks\/pedidos$/);
    expect(buildTestWebhookUrl("pedidos")).toMatch(/\/api\/v1\/webhooks-test\/pedidos$/);
  });
});
