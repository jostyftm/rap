import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { ScreenshotNode } from "@rpa/dsl";

const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
}));

vi.mock("../src/storage/s3.js", async () => {
  const actual = await vi.importActual<typeof import("../src/storage/s3.js")>(
    "../src/storage/s3.js"
  );
  return {
    ...actual,
    uploadArtifactWithStatus: uploadMock,
  };
});

import { buildArtifactUrl } from "../src/storage/s3.js";
import { screenshotHandler } from "../src/engine/handlers/screenshot.handler.js";
import type { ExecutionContext } from "../src/engine/handlers/types.js";
import { LiveServer } from "../src/live/live-server.js";
import type { ExternalBrowserManager } from "../src/live/external-browser.js";

function createCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    runId: "run-shot-1",
    variables: {},
    secrets: {},
    stepResults: {},
    ...overrides,
  };
}

describe("screenshotHandler & buildArtifactUrl", () => {
  const origPublicUrl = process.env.S3_PUBLIC_URL;
  const origEndpoint = process.env.S3_ENDPOINT;
  const origBucket = process.env.S3_BUCKET;

  afterEach(() => {
    vi.clearAllMocks();
    process.env.S3_PUBLIC_URL = origPublicUrl;
    process.env.S3_ENDPOINT = origEndpoint;
    process.env.S3_BUCKET = origBucket;
  });

  it("construye la URL pública de S3 usando S3_ENDPOINT/S3_BUCKET o S3_PUBLIC_URL", () => {
    delete process.env.S3_PUBLIC_URL;
    process.env.S3_ENDPOINT = "http://127.0.0.1:9000/";
    process.env.S3_BUCKET = "rpa-artifacts";

    expect(buildArtifactUrl("runs/r1/screenshots/shot.png")).toBe(
      "http://127.0.0.1:9000/rpa-artifacts/runs/r1/screenshots/shot.png"
    );

    process.env.S3_PUBLIC_URL = "https://cdn.example.com/artifacts/";
    expect(buildArtifactUrl("/runs/r1/screenshots/shot.png")).toBe(
      "https://cdn.example.com/artifacts/runs/r1/screenshots/shot.png"
    );
  });

  it("retorna la URL de S3, clave y metadatos en output al capturar exitosamente", async () => {
    const imgBytes = Buffer.from("fake-png-bytes");
    const mockPage = {
      screenshot: vi.fn().mockResolvedValue(imgBytes),
    } as unknown as Page;

    uploadMock.mockImplementation(async (key: string) => ({
      key,
      bucket: "rpa-artifacts",
      url: `http://127.0.0.1:9000/rpa-artifacts/${key}`,
      uploaded: true,
    }));

    const node: ScreenshotNode = {
      id: "shot_1",
      type: "screenshot",
      description: "Captura principal",
      next: "resp_1",
      params: { fullPage: true, name: "portada principal" },
    };

    const result = await screenshotHandler.execute(mockPage, node, createCtx());

    expect(result.success).toBe(true);
    expect(result.nextNodeId).toBe("resp_1");
    expect(result.screenshotPath).toMatch(
      /^runs\/run-shot-1\/screenshots\/portada_principal-\d+\.png$/
    );

    const out = result.output as Record<string, unknown>;
    expect(out.uploaded).toBe(true);
    expect(out.s3Key).toBe(result.screenshotPath);
    expect(out.url).toBe(`http://127.0.0.1:9000/rpa-artifacts/${result.screenshotPath}`);
    expect(out.s3Url).toBe(out.url);
    expect(out.bucket).toBe("rpa-artifacts");
    expect(out.contentType).toBe("image/png");
    expect(out.sizeBytes).toBe(imgBytes.byteLength);
    expect(out.name).toBe("portada principal");
  });

  it("establece url en null y emite advertencia si falla la subida a S3", async () => {
    const warn = vi.fn();
    const mockPage = {
      screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
    } as unknown as Page;

    uploadMock.mockImplementation(async (key: string) => ({
      key,
      bucket: "rpa-artifacts",
      url: `http://127.0.0.1:9000/rpa-artifacts/${key}`,
      uploaded: false,
    }));

    const node: ScreenshotNode = {
      id: "shot_fail",
      type: "screenshot",
      description: "Captura fallida S3",
      params: { fullPage: false },
    };

    const result = await screenshotHandler.execute(
      mockPage,
      node,
      createCtx({ warn })
    );

    expect(result.success).toBe(true);
    const out = result.output as Record<string, unknown>;
    expect(out.uploaded).toBe(false);
    expect(out.url).toBeNull();
    expect(out.s3Url).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("POST /live/screenshot captura HTML real con Playwright y retorna URL S3 sin mensaje simulado", async () => {
    uploadMock.mockImplementation(async (key: string) => ({
      key,
      bucket: "rpa-artifacts",
      url: `http://127.0.0.1:9000/rpa-artifacts/${key}`,
      uploaded: true,
    }));

    const targetServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body><h1>Live Screenshot Real</h1></body></html>");
    });
    await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
    const targetAddr = targetServer.address();
    const targetPort = typeof targetAddr === "object" && targetAddr ? targetAddr.port : 0;

    const livePort = 18080 + Math.floor(Math.random() * 1000);
    const liveServer = new LiveServer(livePort, "test-live-token", {
      command: async () => false,
      stop: async () => {},
      start: async () => {},
    } as unknown as ExternalBrowserManager);
    liveServer.start();

    try {
      const response = await fetch(`http://127.0.0.1:${livePort}/live/screenshot`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rpa-live-token": "test-live-token",
        },
        body: JSON.stringify({
          recipe_id: "rec_live_1",
          node_id: "shot_live",
          name: "inicio",
          url: `http://127.0.0.1:${targetPort}`,
          full_page: true,
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        output: Record<string, unknown>;
      };
      expect(body.ok).toBe(true);
      expect(body.output.uploaded).toBe(true);
      expect(String(body.output.url)).toMatch(
        /^http:\/\/127\.0\.0\.1:9000\/rpa-artifacts\/live\/rec_live_1\/screenshots\/inicio-\d+\.png$/
      );
      expect(body.output.sizeBytes).toBeGreaterThan(100);
    } finally {
      await liveServer.close();
      await new Promise<void>((resolve) => targetServer.close(() => resolve()));
    }
  }, 15000);
});
