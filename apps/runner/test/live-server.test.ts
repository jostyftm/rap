import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { LiveServer } from "../src/live/live-server.js";

describe("LiveServer Proxy & CORS Handling", () => {
  let mockUpstream: http.Server;
  let upstreamPort: number;
  let liveServer: LiveServer;
  let livePort: number;
  let loopHitCount = 0;
  const token = "test-live-token";

  beforeAll(async () => {
    // 1. Mock upstream server
    mockUpstream = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${upstreamPort}`);

      if (url.pathname === "/redirect-to-www") {
        res.writeHead(301, {
          location: `http://localhost:${upstreamPort}/canonical-page`,
        });
        res.end();
        return;
      }

      if (url.pathname === "/canonical-page") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cross-origin-resource-policy": "same-origin",
          "content-security-policy": "default-src 'self'",
        });
        res.end("<!DOCTYPE html><html><head><title>Canonical</title></head><body><h1>Hello</h1></body></html>");
        return;
      }

      if (url.pathname === "/same-url-loop") {
        loopHitCount++;
        if (loopHitCount === 1) {
          res.writeHead(301, {
            location: `http://localhost:${upstreamPort}/same-url-loop`,
          });
          res.end();
          return;
        }
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        res.end("<!DOCTYPE html><html><head><title>Loop Resolved</title></head><body>Success After Loop</body></html>");
        return;
      }

      if (url.pathname === "/diff-path-redirect") {
        res.writeHead(302, {
          location: `http://localhost:${upstreamPort}/destination-page`,
        });
        res.end();
        return;
      }

      if (url.pathname === "/destination-page") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        res.end("<!DOCTYPE html><html><head><title>Destination</title></head><body>Arrived</body></html>");
        return;
      }

      if (url.pathname === "/icon.svg") {
        res.writeHead(200, {
          "content-type": "image/svg+xml",
          "cross-origin-resource-policy": "same-origin",
        });
        res.end("<svg><circle r='10'/></svg>");
        return;
      }

      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "x-frame-options": "DENY",
      });
      res.end("<!DOCTYPE html><html><head><title>Home</title></head><body>Home</body></html>");
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, "127.0.0.1", () => {
        const addr = mockUpstream.address() as any;
        upstreamPort = addr.port;
        resolve();
      });
    });

    // 2. Start LiveServer on an available port
    livePort = upstreamPort + 100;
    const mockExternal = {
      start: async () => {},
      command: async () => true,
      stop: async () => {},
      closeAll: async () => {},
    } as any;

    liveServer = new LiveServer(livePort, token, mockExternal);
    liveServer.start();
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    await liveServer.close();
    mockUpstream.close();
  });

  it("responde al endpoint de salud /health", async () => {
    const res = await fetch(`http://127.0.0.1:${livePort}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("crea una sesión mediante el control API", async () => {
    const res = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rpa-live-token": token,
      },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/` }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.session_id).toMatch(/^[a-f0-9]{12}$/);
    expect(data.proxy_url).toContain(`.localhost:${livePort}`);
  });

  it("responde a preflight OPTIONS inmediatamente con cabeceras CORS permisivas", async () => {
    const sessRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/` }),
    });
    const { session_id } = await sessRes.json();

    const optionsRes = await fetch(`http://127.0.0.1:${livePort}/`, {
      method: "OPTIONS",
      headers: {
        "x-forwarded-host": `${session_id}.localhost:${livePort}`,
        origin: "http://editor.rpa.test",
        "access-control-request-headers": "x-custom-token",
      },
    });

    expect(optionsRes.status).toBe(204);
    expect(optionsRes.headers.get("access-control-allow-origin")).toBe("http://editor.rpa.test");
    expect(optionsRes.headers.get("access-control-allow-credentials")).toBe("true");
    expect(optionsRes.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("despoja cabeceras restrictivas (CORP, CSP, X-Frame-Options) e inyecta interceptor síncrono", async () => {
    const sessRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/canonical-page` }),
    });
    const { session_id } = await sessRes.json();

    const pageRes = await fetch(`http://127.0.0.1:${livePort}/canonical-page`, {
      headers: { "x-forwarded-host": `${session_id}.localhost:${livePort}` },
    });

    expect(pageRes.status).toBe(200);
    // Verificación de cabeceras despojadas
    expect(pageRes.headers.get("x-frame-options")).toBeNull();
    expect(pageRes.headers.get("content-security-policy")).toBeNull();
    expect(pageRes.headers.get("cross-origin-resource-policy")).toBeNull();
    expect(pageRes.headers.get("access-control-allow-origin")).toBe("*");

    const html = await pageRes.text();
    // Interceptor inyectado en el HTML
    expect(html).toContain("window.__rpaProxyInjected");
    expect(html).toContain("window.__RPA_ORIGIN__");
    expect(html).toContain("/__rpa/picker.js");
  });

  it("evita bucles de auto-redirección 301 hacia la misma URL y resuelve internamente en 200 OK", async () => {
    loopHitCount = 0;
    const sessRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/same-url-loop` }),
    });
    const { session_id } = await sessRes.json();

    // Hacemos la petición con redirect: manual para comprobar que NO le manda un 301 a sí mismo
    const loopRes = await fetch(`http://127.0.0.1:${livePort}/same-url-loop`, {
      headers: { "x-forwarded-host": `${session_id}.localhost:${livePort}` },
      redirect: "manual",
    });

    // Debe responder 200 OK directamente, resolviendo el bucle en el servidor sin ERR_TOO_MANY_REDIRECTS
    expect(loopRes.status).toBe(200);
    const body = await loopRes.text();
    expect(body).toContain("Success After Loop");
  });

  it("emite redirección cuando el destino es una ruta diferente", async () => {
    const sessRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/diff-path-redirect` }),
    });
    const { session_id } = await sessRes.json();

    const redirectRes = await fetch(`http://127.0.0.1:${livePort}/diff-path-redirect`, {
      headers: { "x-forwarded-host": `${session_id}.localhost:${livePort}` },
      redirect: "manual",
    });

    expect(redirectRes.status).toBe(302);
    expect(redirectRes.headers.get("location")).toBe(
      `http://${session_id}.localhost:${livePort}/destination-page`
    );
  });

  it("sirve recursos de terceros mediante /__rpa_proxy con CORS permisivo", async () => {
    const sessRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/` }),
    });
    const { session_id } = await sessRes.json();

    const thirdPartyUrl = `http://127.0.0.1:${upstreamPort}/icon.svg`;
    const proxyReq = await fetch(
      `http://127.0.0.1:${livePort}/__rpa_proxy?url=${encodeURIComponent(thirdPartyUrl)}`,
      {
        headers: {
          "x-forwarded-host": `${session_id}.localhost:${livePort}`,
          origin: `http://${session_id}.localhost:${livePort}`,
        },
      }
    );

    expect(proxyReq.status).toBe(200);
    expect(proxyReq.headers.get("content-type")).toContain("image/svg+xml");
    expect(proxyReq.headers.get("access-control-allow-origin")).toBe(
      `http://${session_id}.localhost:${livePort}`
    );
    expect(proxyReq.headers.get("access-control-allow-credentials")).toBe("true");

    const svg = await proxyReq.text();
    expect(svg).toBe("<svg><circle r='10'/></svg>");
  });

  it("devuelve error 400 en /__rpa_proxy si la URL es inválida o ausente", async () => {
    const sessRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://localhost:${upstreamPort}/` }),
    });
    const { session_id } = await sessRes.json();

    const noUrlRes = await fetch(`http://127.0.0.1:${livePort}/__rpa_proxy`, {
      headers: { "x-forwarded-host": `${session_id}.localhost:${livePort}` },
    });
    expect(noUrlRes.status).toBe(400);

    const badUrlRes = await fetch(
      `http://127.0.0.1:${livePort}/__rpa_proxy?url=ftp://invalid-protocol.com`,
      {
        headers: { "x-forwarded-host": `${session_id}.localhost:${livePort}` },
      }
    );
    expect(badUrlRes.status).toBe(400);
  });
});
