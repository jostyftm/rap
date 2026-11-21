import { describe, it, expect, vi } from "vitest";
import type { Page } from "playwright";
import type { RespondNode } from "@rpa/dsl";
import { respondHandler } from "../src/engine/handlers/respond.handler.js";
import type { AutomationResponse, ExecutionContext } from "../src/engine/handlers/types.js";

function createCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    runId: "run-resp-1",
    variables: {
      usuario: { id: 7, nombre: "Ana" },
      steps: {
        http_1: {
          output: {
            data: {
              base64: Buffer.from("%PDF-1.4 demo").toString("base64"),
              contentType: "application/pdf",
              filename: "factura.pdf",
            },
          },
        },
      },
    },
    secrets: {},
    stepResults: {},
    ...overrides,
  };
}

const dummyPage = {} as Page;

describe("respondHandler", () => {
  it("resuelve referencia directa JSON sin doble serialización y filtra cabeceras de transporte", async () => {
    const emitResponse = vi.fn<(_: AutomationResponse) => Promise<void>>().mockResolvedValue(undefined);
    const ctx = createCtx({ emitResponse });
    const node: RespondNode = {
      id: "resp_json",
      type: "respond",
      description: "Responder JSON",
      next: "after_node",
      params: {
        responseType: "json",
        statusCode: 201,
        body: "{{variables.usuario}}",
        headers: [
          { key: "X-Custom", value: "hola-{{usuario.nombre}}", enabled: true },
          { key: "Content-Length", value: "999", enabled: true },
          { key: "X-Disabled", value: "skip", enabled: false },
        ],
        terminateFlow: true,
      },
    };

    const result = await respondHandler.execute(dummyPage, node, ctx);

    expect(result.success).toBe(true);
    expect(result.terminateFlow).toBe(true);
    expect(emitResponse).toHaveBeenCalledOnce();
    const sent = emitResponse.mock.calls[0][0];
    expect(sent.statusCode).toBe(201);
    expect(sent.contentType).toContain("application/json");
    expect(JSON.parse(sent.body)).toEqual({ id: 7, nombre: "Ana" });
    expect(sent.headers["X-Custom"]).toBe("hola-Ana");
    expect(sent.headers["Content-Length"]).toBeUndefined();
    expect(sent.headers["X-Disabled"]).toBeUndefined();
  });

  it("soporta text, html, xml y terminateFlow=false", async () => {
    for (const [responseType, body, expectedMime] of [
      ["text", "Hola {{usuario.nombre}}", "text/plain; charset=utf-8"],
      ["html", "<h1>{{usuario.nombre}}</h1>", "text/html; charset=utf-8"],
      ["xml", "<user>{{usuario.nombre}}</user>", "application/xml; charset=utf-8"],
    ] as const) {
      const ctx = createCtx();
      const node: RespondNode = {
        id: `resp_${responseType}`,
        type: "respond",
        description: responseType,
        next: "follow_up",
        params: {
          responseType,
          body,
          terminateFlow: false,
        },
      };

      const res = await respondHandler.execute(dummyPage, node, ctx);
      expect(res.terminateFlow).toBe(false);
      expect(res.nextNodeId).toBe("follow_up");
      expect(ctx.response?.contentType).toBe(expectedMime);
      expect(ctx.response?.body).toContain("Ana");
    }
  });

  it("soporta binary passthrough desde httpRequest y data URI", async () => {
    const ctx = createCtx();
    const node: RespondNode = {
      id: "resp_bin",
      type: "respond",
      description: "Binario desde paso previo",
      params: {
        responseType: "binary",
        body: "{{steps.http_1.output.data}}",
      },
    };

    await respondHandler.execute(dummyPage, node, ctx);
    expect(ctx.response?.isBase64).toBe(true);
    expect(ctx.response?.contentType).toBe("application/pdf");
    expect(ctx.response?.filename).toBe("factura.pdf");
    expect(Buffer.from(ctx.response?.body || "", "base64").toString("utf8")).toBe("%PDF-1.4 demo");

    const ctx2 = createCtx();
    const node2: RespondNode = {
      id: "resp_bin_uri",
      type: "respond",
      description: "Binario data URI",
      params: {
        responseType: "binary",
        body: `data:image/png;base64,${Buffer.from("PNG").toString("base64")}`,
        filename: "pic.png",
      },
    };
    await respondHandler.execute(dummyPage, node2, ctx2);
    expect(ctx2.response?.contentType).toBe("image/png");
    expect(ctx2.response?.filename).toBe("pic.png");
    expect(Buffer.from(ctx2.response?.body || "", "base64").toString("utf8")).toBe("PNG");
  });

  it("soporta redirect 302 y empty 204", async () => {
    const ctxRedirect = createCtx();
    const redirectNode: RespondNode = {
      id: "resp_redir",
      type: "respond",
      description: "Redirect",
      params: {
        responseType: "redirect",
        redirectUrl: "https://example.com/u/{{usuario.id}}",
      },
    };

    await respondHandler.execute(dummyPage, redirectNode, ctxRedirect);
    expect(ctxRedirect.response?.statusCode).toBe(302);
    expect(ctxRedirect.response?.redirectUrl).toBe("https://example.com/u/7");
    expect(ctxRedirect.response?.headers.Location).toBe("https://example.com/u/7");

    const ctxEmpty = createCtx();
    const emptyNode: RespondNode = {
      id: "resp_empty",
      type: "respond",
      description: "Empty",
      params: { responseType: "empty" },
    };
    await respondHandler.execute(dummyPage, emptyNode, ctxEmpty);
    expect(ctxEmpty.response?.statusCode).toBe(204);
    expect(ctxEmpty.response?.body).toBe("");
  });
});
