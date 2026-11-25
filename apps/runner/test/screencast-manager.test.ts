import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { LiveServer } from "../src/live/live-server.js";
import { ScreencastManager } from "../src/live/screencast-manager.js";

function waitForWsOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", (err) => reject(err), { once: true });
  });
}

describe("ScreencastManager + LiveServer WebSocket Bridge", () => {
  let mockSite: http.Server;
  let sitePort: number;
  let liveServer: LiveServer;
  let livePort: number;
  let screencastManager: ScreencastManager;
  const token = "test-screencast-token";

  beforeAll(async () => {
    mockSite = http.createServer((req, res) => {
      if (req.url === "/page2") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<!DOCTYPE html><html><head><title>Page 2</title></head><body><h1>Second</h1></body></html>");
        return;
      }

      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Screencast Mock</title>
<style>
  body { margin: 0; padding: 24px; font-family: sans-serif; background: #fff; }
  #btn { width: 180px; height: 48px; font-size: 16px; display: block; margin-bottom: 16px; }
  #txt { width: 240px; height: 36px; display: block; margin-bottom: 16px; }
  #status { font-size: 18px; color: #111; }
</style>
</head>
<body>
  <button id="btn" type="button" onclick="document.getElementById('status').textContent = 'clicked'">Click Me</button>
  <input id="txt" type="text" placeholder="Type here" />
  <div id="status">idle</div>
</body>
</html>`);
    });

    await new Promise<void>((resolve) => {
      mockSite.listen(0, "127.0.0.1", () => {
        sitePort = (mockSite.address() as any).port;
        resolve();
      });
    });

    livePort = sitePort + 150;
    const mockExternal = {
      start: async () => {},
      command: async () => false,
      stop: async () => {},
      closeAll: async () => {},
    } as any;

    screencastManager = new ScreencastManager({ jpegQuality: 70 });
    liveServer = new LiveServer(livePort, token, mockExternal, screencastManager);
    liveServer.start();
    await new Promise((r) => setTimeout(r, 100));
  }, 15000);

  afterAll(async () => {
    await liveServer.close();
    await screencastManager.closeAll();
    await new Promise<void>((resolve) => mockSite.close(() => resolve()));
  }, 15000);

  it("rechaza peticiones sin token (401) o con protocolo inválido (422)", async () => {
    const unauth = await fetch(`http://127.0.0.1:${livePort}/live/screencast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${sitePort}/` }),
    });
    expect(unauth.status).toBe(401);

    const badUrl = await fetch(`http://127.0.0.1:${livePort}/live/screencast`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: "ftp://not-supported.example" }),
    });
    expect(badUrl.status).toBe(422);
  });

  it("rechaza conexión WebSocket con token incorrecto", async () => {
    const res = await fetch(`http://127.0.0.1:${livePort}/live/screencast`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({ url: `http://127.0.0.1:${sitePort}/` }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();

    const failed = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${livePort}/live/ws/${created.session_id}?token=wrong`);
      ws.addEventListener("error", () => resolve(true), { once: true });
      ws.addEventListener("open", () => {
        ws.close();
        resolve(false);
      }, { once: true });
    });
    expect(failed).toBe(true);

    await fetch(`http://127.0.0.1:${livePort}/live/sessions/${created.session_id}`, {
      method: "DELETE",
      headers: { "x-rpa-live-token": token },
    });
  }, 20000);

  it("transmite frames JPEG reales, despacha mouse/teclado/pick y redimensiona viewport por WS", async () => {
    const res = await fetch(`http://127.0.0.1:${livePort}/live/screencast`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rpa-live-token": token },
      body: JSON.stringify({
        url: `http://127.0.0.1:${sitePort}/`,
        recipe_id: "rec_test",
        width: 1024,
        height: 640,
      }),
    });
    expect(res.status).toBe(201);
    const session = await res.json();
    expect(session.session_id).toMatch(/^sc_/);
    expect(session.viewport).toEqual({ width: 1024, height: 640 });

    const ws = new WebSocket(`ws://127.0.0.1:${livePort}${session.ws_path}`);
    ws.binaryType = "arraybuffer";

    const jsonMessages: any[] = [];
    const binaryFrames: Uint8Array[] = [];

    ws.addEventListener("message", (evt) => {
      if (typeof evt.data === "string") {
        jsonMessages.push(JSON.parse(evt.data));
      } else if (evt.data instanceof ArrayBuffer) {
        binaryFrames.push(new Uint8Array(evt.data));
        ws.send(JSON.stringify({ type: "screencast:ack" }));
      }
    });

    await waitForWsOpen(ws);

    // Esperar screencast:ready y primer fotograma JPEG binario (cabecera SOI: FF D8)
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 8000;
      const timer = setInterval(() => {
        const hasReady = jsonMessages.some((m) => m.type === "screencast:ready");
        if (hasReady && binaryFrames.length > 0) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error(`Timeout waiting for frame. json=${jsonMessages.length}, bin=${binaryFrames.length}`));
        }
      }, 50);
    });

    const firstFrame = binaryFrames[0];
    expect(firstFrame[0]).toBe(0xff);
    expect(firstFrame[1]).toBe(0xd8);

    // Probar ping/pong
    const pingTs = Date.now();
    ws.send(JSON.stringify({ type: "screencast:ping", ts: pingTs }));
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (jsonMessages.some((m) => m.type === "screencast:pong" && m.ts === pingTs)) {
          clearInterval(timer);
          resolve();
        }
      }, 20);
    });

    // Probar clic izquierdo sobre #btn (ubicado en padding 24,24 -> centro ~100,45)
    ws.send(JSON.stringify({ type: "input:mouse", action: "mousePressed", x: 100, y: 45, button: "left", clickCount: 1 }));
    ws.send(JSON.stringify({ type: "input:mouse", action: "mouseReleased", x: 100, y: 45, button: "left", clickCount: 1 }));

    await new Promise((r) => setTimeout(r, 250));

    // Enfocar #txt (debajo de #btn: top ~24+48+16 = 88 -> centro ~100,105) e insertar texto
    ws.send(JSON.stringify({ type: "input:mouse", action: "mousePressed", x: 100, y: 105, button: "left", clickCount: 1 }));
    ws.send(JSON.stringify({ type: "input:mouse", action: "mouseReleased", x: 100, y: 105, button: "left", clickCount: 1 }));
    ws.send(JSON.stringify({ type: "input:text", text: "Hola Screencast" }));

    await new Promise((r) => setTimeout(r, 250));

    // Armar picker y hacer clic sobre #btn para recibir rpa:pick por WebSocket
    ws.send(JSON.stringify({ type: "rpa:arm", nodeId: "node_btn_1" }));
    await new Promise((r) => setTimeout(r, 100));
    ws.send(JSON.stringify({ type: "input:mouse", action: "mousePressed", x: 100, y: 45, button: "left", clickCount: 1 }));
    ws.send(JSON.stringify({ type: "input:mouse", action: "mouseReleased", x: 100, y: 45, button: "left", clickCount: 1 }));

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (jsonMessages.some((m) => m.type === "rpa:pick" && m.nodeId === "node_btn_1")) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("No se recibió rpa:pick"));
        }
      }, 30);
    });

    const pick = jsonMessages.find((m) => m.type === "rpa:pick" && m.nodeId === "node_btn_1");
    expect(pick.candidates.some((c: any) => String(c.value).includes("#btn"))).toBe(true);

    // Verificar que antes del arm se ejecutó el click real sobre #btn y escribió en #txt usando rpa:exec
    ws.send(
      JSON.stringify({
        type: "rpa:exec",
        reqId: "check_exec_1",
        nodeId: "node_check",
        action: "extract",
        locator: { primary: { strategy: "css", value: "#status", score: 90 }, fallbacks: [] },
        params: { mode: "text" },
      })
    );

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (jsonMessages.some((m) => m.type === "rpa:exec:result" && m.reqId === "check_exec_1")) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("No se recibió rpa:exec:result"));
        }
      }, 30);
    });

    const execRes = jsonMessages.find((m) => m.reqId === "check_exec_1");
    expect(execRes.ok).toBe(true);
    expect(execRes.output).toBe("clicked");

    // Probar redimensionado de viewport
    ws.send(JSON.stringify({ type: "browser:resize", width: 800, height: 600 }));
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (jsonMessages.some((m) => m.type === "screencast:ready" && m.viewport?.width === 800)) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error("No se confirmó browser:resize"));
        }
      }, 30);
    });

    // Cerrar sesión por API REST
    const closedPromise = new Promise<void>((resolve) => {
      ws.addEventListener("close", () => resolve(), { once: true });
    });
    const delRes = await fetch(`http://127.0.0.1:${livePort}/live/sessions/${session.session_id}`, {
      method: "DELETE",
      headers: { "x-rpa-live-token": token },
    });
    expect(delRes.status).toBe(200);
    await closedPromise;
  }, 25000);

  it("cierra el navegador Chromium del screencast tras idleBrowserCloseMs al detener todas las sesiones", async () => {
    const localManager = new ScreencastManager({ idleBrowserCloseMs: 80 });
    try {
      const created = await localManager.start({
        sessionId: "sc_idle_close_test",
        recipeId: "rec_idle",
        url: `http://127.0.0.1:${sitePort}/`,
      });
      expect((localManager as any).browser).not.toBeNull();

      await localManager.stop(created.sessionId);
      await new Promise((r) => setTimeout(r, 250));

      expect((localManager as any).browser).toBeNull();
    } finally {
      await localManager.closeAll();
    }
  }, 20000);
});
