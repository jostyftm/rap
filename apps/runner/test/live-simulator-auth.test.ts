import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { chromium, type Browser } from "playwright";

describe("Live Simulator Authentication & Virtual Cookie Jar", () => {
  let browser: Browser | null = null;
  let customServer: http.Server | null = null;
  const mockPort = 8199;

  beforeAll(async () => {
    // Servidor mock local para probar tanto contenido estático como cookies Set-Cookie
    customServer = http.createServer((req, res) => {
      const u = new URL(req.url || "/", `http://localhost:${mockPort}`);
      if (u.pathname === "/api/set-session") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": "server_session=xyz987; Path=/",
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (u.pathname === "/api/check-session") {
        const cookie = req.headers["cookie"] || req.headers["x-rpa-cookie"] || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ receivedCookie: cookie }));
        return;
      }
      // Página HTML con formulario y script de login
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Simulated Auth Test</title></head>
          <body>
            <h2>Login Test</h2>
            <form id="login-form">
              <input id="username" name="username" placeholder="Usuario" />
              <input id="password" type="password" name="password" placeholder="Contraseña" />
              <button id="btn-submit" type="submit">Ingresar</button>
            </form>
            <div id="status">Esperando</div>
            <script>
              var form = document.getElementById("login-form");
              form.addEventListener("submit", function(e) {
                e.preventDefault();
                var u = document.getElementById("username").value;
                var p = document.getElementById("password").value;
                if (u === "admin_test" && p === "secret123") {
                  document.cookie = "auth_token=jwt_valid_12345; path=/";
                  document.cookie = "user_role=admin; path=/";
                  document.getElementById("status").textContent = "AUTENTICADO";
                }
              });
            </script>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      customServer?.listen(mockPort, "127.0.0.1", () => resolve());
    });

    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (customServer) {
      await new Promise<void>((resolve) => customServer?.close(() => resolve()));
    }
  });

  it("permite a sitios embebidos en iframe cross-origin escribir y leer document.cookie mediante el Virtual Cookie Jar", async () => {
    const sRes = await fetch("http://localhost:8085/live/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rpa-live-token": "local-live-token",
      },
      body: JSON.stringify({
        url: `http://127.0.0.1:${mockPort}/`,
      }),
    });
    const session = await sRes.json();
    expect(session.session_id).toBeDefined();

    const page = await browser!.newPage();
    // Navegar a un origen diferente (localhost:3000) para forzar contexto third-party iframe
    await page.goto("http://localhost:3000");

    await page.evaluate((proxyUrl) => {
      const ifr = document.createElement("iframe");
      ifr.id = "cookie-test-frame";
      ifr.src = proxyUrl;
      document.body.appendChild(ifr);
    }, session.proxy_url);

    const frameEl = await page.waitForSelector("#cookie-test-frame");
    const frame = await frameEl.contentFrame();
    expect(frame).not.toBeNull();
    await frame!.waitForLoadState("domcontentloaded");

    const result = await frame!.evaluate(() => {
      // Escribir cookies
      document.cookie = "mi_token=token_abc123; path=/";
      document.cookie = "idioma=es-CO; path=/";

      const read1 = document.cookie;
      const hasToken = read1.includes("mi_token=token_abc123");
      const hasIdioma = read1.includes("idioma=es-CO");

      // Eliminar una cookie con fecha expirada
      document.cookie = "idioma=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      const read2 = document.cookie;
      const idiomaEliminado = !read2.includes("idioma=");

      return {
        read1,
        read2,
        hasToken,
        hasIdioma,
        idiomaEliminado,
      };
    });

    expect(result.hasToken).toBe(true);
    expect(result.hasIdioma).toBe(true);
    expect(result.idiomaEliminado).toBe(true);
    await page.close();
  }, 15000);

  it("sincroniza cookies con el servidor LiveServer vía /__rpa_cookie_sync y cabeceras x-rpa-cookie", async () => {
    const sRes = await fetch("http://localhost:8085/live/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rpa-live-token": "local-live-token",
      },
      body: JSON.stringify({
        url: `http://127.0.0.1:${mockPort}/`,
      }),
    });
    const session = await sRes.json();

    const page = await browser!.newPage();
    await page.goto("http://localhost:3000");

    await page.evaluate((proxyUrl) => {
      const ifr = document.createElement("iframe");
      ifr.id = "sync-test-frame";
      ifr.src = proxyUrl;
      document.body.appendChild(ifr);
    }, session.proxy_url);

    const frameEl = await page.waitForSelector("#sync-test-frame");
    const frame = await frameEl.contentFrame();
    expect(frame).not.toBeNull();
    await frame!.waitForLoadState("domcontentloaded");

    // Fijar cookie y verificar que una llamada fetch hacia el servidor proxy envíe la cookie
    const fetchRes = await frame!.evaluate(async () => {
      document.cookie = "sesion_id=usuario_456; path=/";
      const r = await fetch("/api/check-session");
      return r.json();
    });

    expect(fetchRes.receivedCookie).toContain("sesion_id=usuario_456");
    await page.close();
  }, 15000);

  it("ejecuta las acciones de formulario type y click con el script del picker en el simulador interactivo", async () => {
    const sRes = await fetch("http://localhost:8085/live/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rpa-live-token": "local-live-token",
      },
      body: JSON.stringify({
        url: `http://127.0.0.1:${mockPort}/`,
      }),
    });
    const session = await sRes.json();

    const page = await browser!.newPage();
    await page.goto("http://localhost:3000");

    await page.evaluate((proxyUrl) => {
      const ifr = document.createElement("iframe");
      ifr.id = "sim-action-frame";
      ifr.src = proxyUrl;
      document.body.appendChild(ifr);
    }, session.proxy_url);

    const frameEl = await page.waitForSelector("#sim-action-frame");
    const frame = await frameEl.contentFrame();
    expect(frame).not.toBeNull();
    await frame!.waitForLoadState("domcontentloaded");

    // Helper para enviar comandos rpa:exec vía postMessage al iframe
    async function execInIframe(nodeId: string, action: string, locator: any, params: any) {
      const reqId = `${nodeId}-${Date.now()}`;
      return page.evaluate(`
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Timeout ejecutando ${action} en ${nodeId}"));
          }, 10000);

          const onMsg = (e) => {
            if (e.data && e.data.type === "rpa:exec:result" && (e.data.reqId === "${reqId}" || e.data.nodeId === "${nodeId}")) {
              window.removeEventListener("message", onMsg);
              clearTimeout(timeout);
              resolve(e.data);
            }
          };
          window.addEventListener("message", onMsg);

          const iframe = document.getElementById("sim-action-frame");
          iframe.contentWindow.postMessage(
            {
              type: "rpa:exec",
              reqId: "${reqId}",
              nodeId: "${nodeId}",
              action: "${action}",
              locator: ${JSON.stringify(locator)},
              params: ${JSON.stringify(params)},
            },
            "*"
          );
        })
      `);
    }

    // 1. Escribir usuario con el picker
    const resUser = await execInIframe("type_u", "type", {
      primary: { strategy: "css", value: "#username" }
    }, { text: "admin_test", clear: true });
    expect((resUser as any).ok).toBe(true);

    // 2. Escribir contraseña con el picker
    const resPass = await execInIframe("type_p", "type", {
      primary: { strategy: "css", value: "#password" }
    }, { text: "secret123", clear: true });
    expect((resPass as any).ok).toBe(true);

    // 3. Hacer clic en botón submit con el picker
    const resClick = await execInIframe("click_btn", "click", {
      primary: { strategy: "css", value: "#btn-submit" }
    }, { button: "left" });
    expect((resClick as any).ok).toBe(true);

    await page.waitForTimeout(500);

    // Verificar que el estado del formulario cambió a AUTENTICADO y las cookies se guardaron
    const statusText = await frame!.evaluate(() => document.getElementById("status")?.textContent);
    expect(statusText).toBe("AUTENTICADO");

    const cookies = await frame!.evaluate(() => document.cookie);
    expect(cookies).toContain("auth_token=jwt_valid_12345");
    expect(cookies).toContain("user_role=admin");

    await page.close();
  }, 15000);
});
