import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  SecretClient,
  SecretResolutionError,
  type SecretClientOptions,
} from "../src/secrets/secret-client.js";

function buildClient(fetchImpl: typeof fetch, overrides: Partial<SecretClientOptions> = {}) {
  return new SecretClient({
    baseUrl: "http://api.test",
    secret: "shared-secret",
    fetchImpl,
    now: () => 1_700_000_000_000,
    nonce: () => "fixed-nonce",
    ...overrides,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SecretClient", () => {
  it("firma la petición y devuelve solo las referencias solicitadas", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ secrets: { A: "uno", B: "dos" } }));
    const client = buildClient(fetchMock as unknown as typeof fetch);

    const result = await client.fetchSecrets("run-1", ["A"]);

    expect(result).toEqual({ A: "uno" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const expectedSignature = createHmac("sha256", "shared-secret")
      .update("run-1|1700000000|fixed-nonce")
      .digest("hex");

    expect(url).toBe("http://api.test/api/internal/v1/runs/run-1/secrets");
    expect(init.headers).toMatchObject({
      "X-RPA-Timestamp": "1700000000",
      "X-RPA-Nonce": "fixed-nonce",
      "X-RPA-Signature": expectedSignature,
    });
    expect(JSON.parse(String(init.body))).toEqual({ refs: ["A"] });
  });

  it("cachea los secretos por ejecución", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ secrets: { A: "uno" } }));
    const client = buildClient(fetchMock as unknown as typeof fetch);

    await client.fetchSecrets("run-1", ["A"]);
    await client.fetchSecrets("run-1", ["A"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    client.clear("run-1");
    await client.fetchSecrets("run-1", ["A"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falla si el workspace no tiene alguna referencia", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ secrets: {} }));
    const client = buildClient(fetchMock as unknown as typeof fetch);

    await expect(client.fetchSecrets("run-1", ["PORTAL_PASSWORD"])).rejects.toThrow(
      /PORTAL_PASSWORD/
    );
  });

  it("no llama al endpoint si no hay referencias", async () => {
    const fetchMock = vi.fn();
    const client = buildClient(fetchMock as unknown as typeof fetch);

    await expect(client.fetchSecrets("run-1", [])).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propaga errores HTTP sin exponer el cuerpo", async () => {
    const fetchMock = vi.fn(async () => new Response("detalle interno", { status: 422 }));
    const client = buildClient(fetchMock as unknown as typeof fetch);

    await expect(client.fetchSecrets("run-1", ["A"])).rejects.toBeInstanceOf(SecretResolutionError);
  });

  it("falla cerrado si no hay secreto compartido", async () => {
    const client = new SecretClient({ secret: "", fetchImpl: vi.fn() as unknown as typeof fetch });

    await expect(client.fetchSecrets("run-1", ["A"])).rejects.toThrow(/RPA_INTERNAL_SECRET/);
  });
});
