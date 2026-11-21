import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright";
import type { HttpRequestMethod, HttpRequestNode } from "@rpa/dsl";
import { httpRequestHandler } from "../src/engine/handlers/http-request.handler.js";
import type { ExecutionContext } from "../src/engine/handlers/types.js";

let server: http.Server;
let baseUrl = "";
const dummyPage = {} as Page;

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    runId: "run-http-1",
    variables: {
      itemId: "42",
      payloadObj: { hello: "world", count: 2 },
    },
    secrets: {
      API_TOKEN: "sec-tok-999",
    },
    stepResults: {},
    ...overrides,
  };
}

describe("httpRequestHandler", () => {
  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
      const rawBody = await readBody(req);

      if (reqUrl.pathname === "/xml") {
        res.writeHead(200, { "content-type": "application/xml" });
        res.end("<root><ok>true</ok></root>");
        return;
      }

      if (reqUrl.pathname === "/text") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("hola texto");
        return;
      }

      if (reqUrl.pathname === "/binary") {
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="report.pdf"',
        });
        res.end(Buffer.from("%PDF-BIN"));
        return;
      }

      if (reqUrl.pathname === "/error-500") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "boom" }));
        return;
      }

      if (reqUrl.pathname === "/slow") {
        await new Promise((r) => setTimeout(r, 400));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ slow: true }));
        return;
      }

      res.writeHead(200, {
        "content-type": "application/json",
        "x-server-method": req.method || "GET",
      });
      res.end(
        JSON.stringify({
          method: req.method,
          pathname: reqUrl.pathname,
          query: Object.fromEntries(reqUrl.searchParams.entries()),
          headers: req.headers,
          bodyText: rawBody.toString("utf8"),
          bodyBase64: rawBody.toString("base64"),
        })
      );
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("soporta todos los verbos HTTP (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)", async () => {
    const methods: HttpRequestMethod[] = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ];

    for (const method of methods) {
      const ctx = createCtx();
      const node: HttpRequestNode = {
        id: `http_${method}`,
        type: "httpRequest",
        description: `Verbo ${method}`,
        params: {
          method,
          url: `${baseUrl}/echo`,
          responseType: method === "HEAD" ? "headersOnly" : "json",
        },
      };

      const res = await httpRequestHandler.execute(dummyPage, node, ctx);
      expect(res.success).toBe(true);
      const out = res.output as { status: number; headers: Record<string, string>; data: any };
      expect(out.status).toBe(200);
      expect(out.headers["x-server-method"]).toBe(method);
      if (method !== "HEAD") {
        expect(out.data.method).toBe(method);
      } else {
        expect(out.data).toBeNull();
      }
    }
  });

  it("resuelve pathParams, queryParams, headers, auth Bearer/Basic/ApiKey y outputVariable", async () => {
    const ctx = createCtx();
    const bearerNode: HttpRequestNode = {
      id: "http_bearer",
      type: "httpRequest",
      description: "Bearer",
      params: {
        method: "GET",
        url: `${baseUrl}/users/:id/items/{itemSlug}`,
        pathParams: [
          { key: "id", value: "{{itemId}}", enabled: true },
          { key: "itemSlug", value: "orden 1", enabled: true },
        ],
        queryParams: [
          { key: "filter", value: "active", enabled: true },
          { key: "ignored", value: "no", enabled: false },
        ],
        headers: [{ key: "X-Trace", value: "tr-1", enabled: true }],
        auth: { type: "bearer", token: "{{secret.API_TOKEN}}" },
        outputVariable: "resApi",
      },
    };

    const res = await httpRequestHandler.execute(dummyPage, bearerNode, ctx);
    const out = res.output as { data: any };
    expect(out.data.pathname).toBe("/users/42/items/orden%201");
    expect(out.data.query).toEqual({ filter: "active" });
    expect(out.data.headers["x-trace"]).toBe("tr-1");
    expect(out.data.headers["authorization"]).toBe("Bearer sec-tok-999");
    expect(ctx.variables.resApi).toEqual(out);

    const apiKeyNode: HttpRequestNode = {
      id: "http_apikey",
      type: "httpRequest",
      description: "API key query",
      params: {
        method: "GET",
        url: `${baseUrl}/items`,
        auth: {
          type: "apiKey",
          keyName: "api_key",
          keyValue: "{{secret.API_TOKEN}}",
          in: "query",
        },
      },
    };
    const res2 = await httpRequestHandler.execute(dummyPage, apiKeyNode, ctx);
    expect((res2.output as any).data.query.api_key).toBe("sec-tok-999");

    const basicNode: HttpRequestNode = {
      id: "http_basic",
      type: "httpRequest",
      description: "Basic auth",
      params: {
        method: "GET",
        url: `${baseUrl}/items`,
        auth: { type: "basic", username: "admin", password: "pw" },
      },
    };
    const res3 = await httpRequestHandler.execute(dummyPage, basicNode, ctx);
    expect((res3.output as any).data.headers["authorization"]).toBe(
      `Basic ${Buffer.from("admin:pw").toString("base64")}`
    );
  });

  it("envía body json, formUrlEncoded, multipart (con archivo base64), raw y binary", async () => {
    const ctx = createCtx();

    const jsonRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "b_json",
        type: "httpRequest",
        description: "JSON body",
        params: {
          method: "POST",
          url: `${baseUrl}/post`,
          bodyType: "json",
          bodyJson: "{{payloadObj}}",
        },
      },
      ctx
    );
    expect((jsonRes.output as any).data.bodyText).toBe('{"hello":"world","count":2}');

    const formRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "b_form",
        type: "httpRequest",
        description: "Form body",
        params: {
          method: "POST",
          url: `${baseUrl}/post`,
          bodyType: "formUrlEncoded",
          bodyForm: [
            { key: "user", value: "ana", enabled: true },
            { key: "id", value: "{{itemId}}", enabled: true },
          ],
        },
      },
      ctx
    );
    expect((formRes.output as any).data.bodyText).toBe("user=ana&id=42");

    const multiRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "b_multi",
        type: "httpRequest",
        description: "Multipart",
        params: {
          method: "POST",
          url: `${baseUrl}/post`,
          bodyType: "multipart",
          bodyMultipart: [
            { key: "title", value: "Doc {{itemId}}", fieldType: "text", enabled: true },
            {
              key: "attachment",
              value: Buffer.from("PDFDATA").toString("base64"),
              fieldType: "fileBase64",
              filename: "doc.pdf",
              contentType: "application/pdf",
              enabled: true,
            },
          ],
        },
      },
      ctx
    );
    const multiOut = (multiRes.output as any).data;
    expect(multiOut.headers["content-type"]).toContain("multipart/form-data; boundary=");
    expect(multiOut.bodyText).toContain('name="title"');
    expect(multiOut.bodyText).toContain("Doc 42");
    expect(multiOut.bodyText).toContain('filename="doc.pdf"');
    expect(multiOut.bodyText).toContain("PDFDATA");

    const binRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "b_bin",
        type: "httpRequest",
        description: "Binary",
        params: {
          method: "PUT",
          url: `${baseUrl}/put`,
          bodyType: "binary",
          bodyBinaryBase64: Buffer.from("RAWBYTES").toString("base64"),
          binaryContentType: "application/octet-stream",
        },
      },
      ctx
    );
    expect(
      Buffer.from((binRes.output as any).data.bodyBase64, "base64").toString("utf8")
    ).toBe("RAWBYTES");
  });

  it("decodifica respuestas text, xml, binary y maneja failOnHttpError + timeout", async () => {
    const ctx = createCtx();

    const textRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "r_text",
        type: "httpRequest",
        description: "Text",
        params: { method: "GET", url: `${baseUrl}/text`, responseType: "text" },
      },
      ctx
    );
    expect((textRes.output as any).data).toBe("hola texto");

    const xmlRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "r_xml",
        type: "httpRequest",
        description: "XML",
        params: { method: "GET", url: `${baseUrl}/xml`, responseType: "xml" },
      },
      ctx
    );
    expect((xmlRes.output as any).data).toBe("<root><ok>true</ok></root>");

    const binRes = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "r_bin",
        type: "httpRequest",
        description: "Binary",
        params: { method: "GET", url: `${baseUrl}/binary`, responseType: "binary" },
      },
      ctx
    );
    const binOut = (binRes.output as any).data;
    expect(binOut.contentType).toBe("application/pdf");
    expect(binOut.filename).toBe("report.pdf");
    expect(Buffer.from(binOut.base64, "base64").toString("utf8")).toBe("%PDF-BIN");

    await expect(
      httpRequestHandler.execute(
        dummyPage,
        {
          id: "r_err_fail",
          type: "httpRequest",
          description: "500 fail",
          params: { method: "GET", url: `${baseUrl}/error-500`, failOnHttpError: true },
        },
        ctx
      )
    ).rejects.toThrow("500");

    const noFail = await httpRequestHandler.execute(
      dummyPage,
      {
        id: "r_err_ok",
        type: "httpRequest",
        description: "500 continue",
        params: { method: "GET", url: `${baseUrl}/error-500`, failOnHttpError: false },
      },
      ctx
    );
    expect((noFail.output as any).status).toBe(500);
    expect((noFail.output as any).ok).toBe(false);
    expect((noFail.output as any).data).toEqual({ message: "boom" });
  });
});
