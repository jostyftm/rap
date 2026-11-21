import http from "node:http";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { PICKER_JS } from "./picker-script.js";
import { PROXY_CLIENT_JS } from "./proxy-client-script.js";
import type { ExternalBrowserManager } from "./external-browser.js";
import type { ScreencastManager } from "./screencast-manager.js";
import { WsServer } from "./ws-server.js";

interface LiveSession {
  id: string;
  origin: string;
  lastUsed: number;
  mockMac?: string | string[];
  mockVersion?: string;
  cookies: Map<string, string>;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const STRIP_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-resource-policy",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "strict-transport-security",
  "set-cookie",
  "connection",
  "keep-alive",
]);
const TEXT_TYPES = /text\/html|text\/css|javascript|application\/json|text\/plain|application\/xml|text\/xml/i;

export class LiveServer {
  private sessions = new Map<string, LiveSession>();
  private originToSession = new Map<string, string>();
  private server: http.Server | null = null;
  private wss = new WsServer();

  constructor(
    private port: number,
    private token: string,
    private external: ExternalBrowserManager,
    private screencast?: ScreencastManager
  ) {}

  start(): void {
    this.server = http.createServer({ maxHeaderSize: 262144 }, (req, res) => {
      this.route(req, res).catch((err) => {
        console.error("[LiveServer] Error:", err);
        if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        const cause = err?.cause?.message || err?.cause?.code;
        const msg = cause ? `${err?.message ?? err} (${cause})` : `${err?.message ?? err}`;
        res.end(`RPA Live proxy error: ${msg}`);
      });
    });
    this.server.on("upgrade", (req, socket, head) => {
      try {
        const parsed = new URL(req.url || "/", "http://localhost");
        const match = parsed.pathname.match(/^\/live\/ws\/([a-z0-9_-]+)$/i);
        const token = parsed.searchParams.get("token") || "";
        if (!this.screencast || !match || !this.screencast.verifyWsToken(match[1], token)) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.screencast!.attachClient(match[1], ws).catch(() => {
            ws.close(1011, "Internal error");
          });
        });
      } catch {
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
    });
    this.server.listen(this.port, "0.0.0.0", () => {
      console.log(`[LiveServer] Sitio en vivo (proxy + control) escuchando en :${this.port}`);
    });
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
  }

  async close(): Promise<void> {
    this.wss.close();
    this.server?.close();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastUsed > SESSION_TTL_MS) {
        this.sessions.delete(id);
        this.originToSession.delete(s.origin);
      }
    }
  }

  private sessionFor(origin: string): LiveSession {
    const existing = this.originToSession.get(origin);
    if (existing && this.sessions.has(existing)) {
      const s = this.sessions.get(existing)!;
      s.lastUsed = Date.now();
      return s;
    }
    const s: LiveSession = {
      id: randomBytes(6).toString("hex"),
      origin,
      lastUsed: Date.now(),
      cookies: new Map(),
    };
    this.sessions.set(s.id, s);
    this.originToSession.set(origin, s.id);
    return s;
  }

  private proxyOrigin(sid: string): string {
    return `http://${sid}.localhost:${this.port}`;
  }

  private applyCorsHeaders(
    outHeaders: Record<string, string | string[]>,
    req: http.IncomingMessage
  ): void {
    outHeaders["access-control-allow-origin"] = req.headers.origin || "*";
    outHeaders["access-control-allow-credentials"] = "true";
    outHeaders["access-control-allow-methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD";
    outHeaders["access-control-allow-headers"] =
      (req.headers["access-control-request-headers"] as string) || "*";
    outHeaders["access-control-max-age"] = "86400";
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const rawHost = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
    const host = rawHost.toLowerCase();
    const urlPath = req.url || "/";

    if (urlPath.startsWith("/__rpa/picker.js")) {
      const headers: Record<string, string | string[]> = {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      };
      this.applyCorsHeaders(headers, req);
      res.writeHead(200, headers);
      res.end(PICKER_JS);
      return;
    }

    const match = host.match(/^([a-f0-9]{12})\.localhost(?::\d+)?$/);
    if (match) {
      const sid = match[1];
      if (urlPath.startsWith("/__rpa_proxy")) {
        await this.handleRpaProxy(sid, req, res);
        return;
      }
      if (urlPath.startsWith("/__rpa_mock/mac")) {
        this.handleMockMac(sid, req, res);
        return;
      }
      if (urlPath.startsWith("/__rpa_mock/version")) {
        this.handleMockVersion(sid, req, res);
        return;
      }
      if (urlPath.startsWith("/__rpa_cookie_sync")) {
        await this.handleCookieSync(sid, req, res);
        return;
      }
      await this.handleProxy(sid, req, res);
      return;
    }
    await this.handleControl(req, res);
  }

  // ------------------------------------------------------------------ Control API
  private async readBody(req: http.IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private async handleControl(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", "http://control");
    const path = url.pathname;

    if (path === "/health") return this.json(res, 200, { ok: true, sessions: this.sessions.size });

    if (req.headers["x-rpa-live-token"] !== this.token) {
      return this.json(res, 401, { error: "unauthorized" });
    }

    if (req.method === "POST" && path === "/live/sessions") {
      const body = JSON.parse((await this.readBody(req)).toString() || "{}");
      let rawUrl = String(body.url || "").trim();
      if (rawUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }
      let target: URL;
      try {
        target = new URL(rawUrl);
        if (!/^https?:$/.test(target.protocol)) throw new Error("protocolo no soportado");
      } catch {
        return this.json(res, 422, { error: "URL inválida" });
      }
      const session = this.sessionFor(target.origin);
      if (body.mock_mac !== undefined) session.mockMac = body.mock_mac;
      if (body.mock_version !== undefined) session.mockVersion = body.mock_version;
      return this.json(res, 201, {
        session_id: session.id,
        origin: target.origin,
        proxy_url: `${this.proxyOrigin(session.id)}${target.pathname}${target.search}${target.hash}`,
      });
    }

    const cmd = path.match(/^\/live\/sessions\/([a-z0-9_-]+)\/command$/i);
    if (req.method === "POST" && cmd) {
      const body = JSON.parse((await this.readBody(req)).toString() || "{}");
      let ok = await this.external.command(cmd[1], body.message);
      if (!ok && this.screencast) {
        ok = await this.screencast.command(cmd[1], body.message);
      }
      return this.json(res, ok ? 200 : 404, { ok });
    }

    const del = path.match(/^\/live\/sessions\/([a-z0-9_-]+)$/i);
    if (req.method === "DELETE" && del) {
      await this.external.stop(del[1]);
      await this.screencast?.stop(del[1]);
      const s = this.sessions.get(del[1]);
      if (s) {
        this.sessions.delete(s.id);
        this.originToSession.delete(s.origin);
      }
      return this.json(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/live/screencast") {
      if (!this.screencast) {
        return this.json(res, 501, { error: "screencast not enabled" });
      }
      const body = JSON.parse((await this.readBody(req)).toString() || "{}");
      let rawUrl = String(body.url || "").trim();
      if (rawUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }
      let target: URL;
      try {
        target = new URL(rawUrl);
        if (!/^https?:$/.test(target.protocol)) throw new Error("protocolo no soportado");
      } catch {
        return this.json(res, 422, { error: "URL inválida" });
      }
      const sessionId = `sc_${randomBytes(6).toString("hex")}`;
      const started = await this.screencast.start({
        sessionId,
        recipeId: body.recipe_id,
        url: target.href,
        width: body.width,
        height: body.height,
      });
      const wsPath = `/live/ws/${started.sessionId}?token=${started.wsToken}`;
      return this.json(res, 201, {
        session_id: started.sessionId,
        ws_token: started.wsToken,
        ws_path: wsPath,
        ws_port: this.port,
        ws_url: `ws://localhost:${this.port}${wsPath}`,
        origin: started.origin,
        viewport: started.viewport,
      });
    }

    if (req.method === "POST" && path === "/live/external") {
      const body = JSON.parse((await this.readBody(req)).toString() || "{}");
      const sessionId = `ext_${randomBytes(5).toString("hex")}`;
      await this.external.start({ sessionId, recipeId: body.recipe_id, url: body.url });
      return this.json(res, 201, { session_id: sessionId, origin: new URL(body.url).origin });
    }

    this.json(res, 404, { error: "not found" });
  }

  // ------------------------------------------------------------------ Reverse proxy
  private rewriteText(text: string, origin: string, proxyOrigin: string): string {
    let result = text;
    try {
      const u = new URL(origin);
      const host = u.host;
      const proxyHost = new URL(proxyOrigin).host;

      // Reemplazo del origen base
      result = result.split(origin).join(proxyOrigin).split(`//${host}`).join(`//${proxyHost}`);

      // Reemplazo de variante www o sin-www
      const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
      const altOrigin = `${u.protocol}//${altHost}`;
      result = result.split(altOrigin).join(proxyOrigin).split(`//${altHost}`).join(`//${proxyHost}`);
    } catch {
      result = text.split(origin).join(proxyOrigin);
    }

    // Despojar atributos restrictivos en el HTML que causan bloqueos CORS o fallos SRI
    result = result
      .replace(/\s+crossorigin(?:="[^"]*"|='[^']*')?/gi, "")
      .replace(/\s+integrity=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

    return result;
  }

  private handleMockMac(sid: string, req: http.IncomingMessage, res: http.ServerResponse): void {
    const session = this.sessions.get(sid);
    const headers: Record<string, string | string[]> = {
      "content-type": "application/json; charset=utf-8",
    };
    this.applyCorsHeaders(headers, req);

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const mockMac = session?.mockMac;
    const body = mockMac ? (Array.isArray(mockMac) ? mockMac : [String(mockMac)]) : [];
    res.writeHead(200, headers);
    res.end(JSON.stringify(body));
  }

  private handleMockVersion(sid: string, req: http.IncomingMessage, res: http.ServerResponse): void {
    const session = this.sessions.get(sid);
    const headers: Record<string, string | string[]> = {
      "content-type": "application/json; charset=utf-8",
    };
    this.applyCorsHeaders(headers, req);

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const version = session?.mockVersion || "4.8.6";
    res.writeHead(200, headers);
    res.end(JSON.stringify(version));
  }

  private async handleCookieSync(sid: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const session = this.sessions.get(sid);
    const corsHeaders: Record<string, string | string[]> = {
      "content-type": "application/json; charset=utf-8",
    };
    this.applyCorsHeaders(corsHeaders, req);

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (session) {
      try {
        const bodyBuf = await this.readBody(req);
        const data = JSON.parse(bodyBuf.toString("utf8") || "{}");
        if (data.name) {
          if (data.value === "" || (data.expires && data.expires <= Date.now())) {
            session.cookies.delete(data.name);
          } else {
            session.cookies.set(data.name, String(data.value));
          }
        }
      } catch {}
    }

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ ok: true }));
  }

  /**
   * Envía la respuesta al cliente optimizada:
   * - Si es contenido binario / media / streaming (video, audio, etc.), realiza streaming
   *   directo con Readable.fromWeb() sin almacenarlo todo en memoria Buffer, preservando
   *   content-length y cabeceras de Range/206.
   * - Si es texto reescribible (HTML, CSS, JS), lo lee en memoria para inyectar scripts y reescribir URLs.
   */
  private async sendUpstreamResponse(
    upstream: Response,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    session: LiveSession | null,
    proxyOrigin: string,
    accumulatedCookies?: string[]
  ): Promise<void> {
    const outHeaders: Record<string, string | string[]> = {};
    upstream.headers.forEach((value, key) => {
      if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      outHeaders[key] = value;
    });

    this.applyCorsHeaders(outHeaders, req);

    if (accumulatedCookies && accumulatedCookies.length) {
      outHeaders["set-cookie"] = accumulatedCookies.map((c) =>
        c
          .replace(/;\s*Domain=[^;]*/gi, "")
          .replace(/;\s*Secure/gi, "")
          .replace(/;\s*SameSite=[^;]*/gi, "")
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    const isText = TEXT_TYPES.test(contentType);

    if (!isText) {
      const cl = upstream.headers.get("content-length");
      if (cl) outHeaders["content-length"] = cl;

      res.writeHead(upstream.status, outHeaders);
      if (upstream.body) {
        const stream = Readable.fromWeb(upstream.body as any);
        stream.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        stream.pipe(res);
      } else {
        res.end();
      }
      return;
    }

    // Contenido de texto: leer en memoria para reescritura
    const buf = Buffer.from(await upstream.arrayBuffer());

    if (session && /text\/html/i.test(contentType)) {
      let text = buf.toString("utf8");
      text = this.rewriteText(text, session.origin, proxyOrigin);
      const mocks = { mac: session.mockMac, version: session.mockVersion };
      const initialCookies = Object.fromEntries(session.cookies);
      const inject =
        `<script>` +
        `window.__RPA_ORIGIN__=${JSON.stringify(session.origin)};\n` +
        `window.__RPA_MOCKS__=${JSON.stringify(mocks)};\n` +
        `window.__RPA_INITIAL_COOKIES__=${JSON.stringify(initialCookies)};\n` +
        `${PROXY_CLIENT_JS}</script>` +
        `<script src="/__rpa/picker.js"></script>`;
      text = /<head[^>]*>/i.test(text)
        ? text.replace(/<head[^>]*>/i, (m) => m + inject)
        : inject + text;
      const out = Buffer.from(text, "utf8");
      outHeaders["content-length"] = String(out.length);
      res.writeHead(upstream.status, outHeaders);
      res.end(out);
      return;
    } else if (session) {
      let text = buf.toString("utf8");
      text = this.rewriteText(text, session.origin, proxyOrigin);
      const out = Buffer.from(text, "utf8");
      outHeaders["content-length"] = String(out.length);
      res.writeHead(upstream.status, outHeaders);
      res.end(out);
      return;
    }

    outHeaders["content-length"] = String(buf.length);
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  }

  /**
   * Endpoint /__rpa_proxy?url=...
   * Descarga cualquier recurso de terceros (ej. gstatic.com) libre de restricciones CORS de navegador
   */
  private async handleRpaProxy(
    sid: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const proxyOrigin = this.proxyOrigin(sid);

    if (req.method === "OPTIONS") {
      const corsHeaders: Record<string, string | string[]> = {};
      this.applyCorsHeaders(corsHeaders, req);
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    let targetParam: string | null = null;
    try {
      const parsed = new URL(req.url || "/", proxyOrigin);
      targetParam = parsed.searchParams.get("url");
    } catch {
      targetParam = null;
    }

    if (!targetParam) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Parámetro url faltante en __rpa_proxy");
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(targetParam);
      if (!/^https?:$/.test(targetUrl.protocol)) {
        throw new Error("Protocolo no soportado");
      }
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("URL inválida en __rpa_proxy");
      return;
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      const key = k.toLowerCase();
      if (
        ["host", "connection", "accept-encoding", "if-none-match", "if-modified-since", "content-length"].includes(
          key
        )
      ) {
        continue;
      }
      headers[key] = Array.isArray(v) ? v.join(", ") : v;
    }
    headers["accept-encoding"] = "identity";
    headers.origin = targetUrl.origin;
    headers.referer = targetUrl.origin + "/";

    const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
    const body = hasBody ? await this.readBody(req) : undefined;

    const ac = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    let currentTarget = targetUrl.href;
    let upstream: Response | null = null;
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;

    try {
      while (redirectCount < MAX_REDIRECTS) {
        upstream = await fetch(currentTarget, {
          method: req.method,
          headers,
          body: body && body.length ? new Uint8Array(body) : undefined,
          redirect: "manual",
          signal: ac.signal,
        });

        const location = upstream.headers.get("location");
        if (upstream.status >= 300 && upstream.status < 400 && location) {
          try {
            currentTarget = new URL(location, currentTarget).href;
            redirectCount++;
            continue;
          } catch {
            break;
          }
        }
        break;
      }

      if (!upstream) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end(`Error al conectar con ${targetUrl.href}`);
        return;
      }

      await this.sendUpstreamResponse(upstream, req, res, null, proxyOrigin);
    } catch (err: any) {
      if (ac.signal.aborted || req.destroyed) return;
      console.warn(`[LiveServer] Error en __rpa_proxy para ${targetUrl.href}:`, err?.message || err);
      const errHeaders: Record<string, string | string[]> = {
        "content-type": "text/plain; charset=utf-8",
      };
      this.applyCorsHeaders(errHeaders, req);
      const cause = err?.cause?.message || err?.cause?.code;
      const msg = cause ? `${err?.message || err} (${cause})` : `${err?.message || err}`;
      if (!res.headersSent) res.writeHead(502, errHeaders);
      res.end(`Error al conectar con ${targetUrl.href}: ${msg}`);
    }
  }

  private async handleProxy(sid: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const session = this.sessions.get(sid);
    if (!session) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Sesión live no encontrada o expirada");
      return;
    }
    session.lastUsed = Date.now();
    const proxyOrigin = this.proxyOrigin(sid);

    // Responder preflight OPTIONS inmediatamente con cabeceras CORS
    if (req.method === "OPTIONS") {
      const corsHeaders: Record<string, string | string[]> = {};
      this.applyCorsHeaders(corsHeaders, req);
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const targetUrl = session.origin + (req.url || "/");

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      const key = k.toLowerCase();
      if (
        ["host", "connection", "accept-encoding", "if-none-match", "if-modified-since", "content-length"].includes(
          key
        )
      ) {
        continue;
      }
      headers[key] = Array.isArray(v) ? v.join(", ") : v;
    }
    headers["accept-encoding"] = "identity";
    if (headers.origin) headers.origin = session.origin;
    if (headers.referer) headers.referer = headers.referer.split(proxyOrigin).join(session.origin);

    // Sincronizar cookies enviadas por el cliente (vía x-rpa-cookie o cookie)
    const clientCookies = (req.headers["x-rpa-cookie"] as string) || (req.headers.cookie as string) || "";
    if (clientCookies) {
      const parts = clientCookies.split(";");
      for (const p of parts) {
        const eq = p.indexOf("=");
        if (eq > 0) {
          const k = p.slice(0, eq).trim();
          const v = p.slice(eq + 1).trim();
          if (k) session.cookies.set(k, v);
        }
      }
    }

    // Inyectar cookies acumuladas de sesión para upstream
    if (session.cookies.size > 0) {
      const cookieHeader = Array.from(session.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      headers["cookie"] = cookieHeader;
    }

    const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
    const body = hasBody ? await this.readBody(req) : undefined;

    const ac = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    let currentTarget = targetUrl;
    let upstream: Response | null = null;
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;
    const accumulatedCookies: string[] = [];

    while (redirectCount < MAX_REDIRECTS) {
      try {
        upstream = await fetch(currentTarget, {
          method: req.method,
          headers,
          body: body && body.length ? new Uint8Array(body) : undefined,
          redirect: "manual",
          signal: ac.signal,
        });
      } catch (fetchErr: any) {
        if (ac.signal.aborted || req.destroyed) return;
        console.error(`[LiveServer] Error fetching ${currentTarget}:`, fetchErr);
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        }
        const cause = fetchErr?.cause?.message || fetchErr?.cause?.code;
        const msg = cause ? `${fetchErr?.message ?? fetchErr} (${cause})` : `${fetchErr?.message ?? fetchErr}`;
        res.end(`RPA Live proxy error al conectar con ${currentTarget}: ${msg}`);
        return;
      }

      const sc = (upstream.headers as any).getSetCookie?.() as string[] | undefined;
      if (sc && sc.length) {
        accumulatedCookies.push(...sc);
        for (const cookieItem of sc) {
          const first = cookieItem.split(";")[0];
          const eq = first.indexOf("=");
          if (eq > 0) {
            const k = first.slice(0, eq).trim();
            const v = first.slice(eq + 1).trim();
            const isExpired = /expires=Thu, 01 Jan 1970/i.test(cookieItem) || /max-age=0/i.test(cookieItem);
            if (isExpired) {
              session.cookies.delete(k);
            } else if (k) {
              session.cookies.set(k, v);
            }
          }
        }
      }

      const location = upstream.headers.get("location");
      if (upstream.status >= 300 && upstream.status < 400 && location) {
        try {
          const abs = new URL(location, currentTarget);
          const sessionHost = new URL(session.origin).host.toLowerCase();
          const targetHost = abs.host.toLowerCase();

          const isSameSite =
            abs.origin === session.origin ||
            targetHost === sessionHost ||
            targetHost === `www.${sessionHost}` ||
            sessionHost === `www.${targetHost}`;

          if (isSameSite) {
            session.origin = abs.origin;
            this.originToSession.set(abs.origin, session.id);

            const destLocation = `${proxyOrigin}${abs.pathname}${abs.search}${abs.hash}`;
            const currentRequestUrl = `${proxyOrigin}${req.url || "/"}`;

            // Si es un auto-redireccionamiento hacia la misma URL en el proxy (ej. solo cambio www o https en la raiz),
            // lo seguimos internamente en el servidor en lugar de enviar un bucle 301 al navegador.
            if (destLocation === currentRequestUrl) {
              currentTarget = abs.href;
              redirectCount++;
              continue;
            }
          }
        } catch {
          // Si falla parsear la URL, salir del bucle
        }
      }

      break;
    }

    if (!upstream) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Error al contactar con el sitio upstream");
      return;
    }

    const outHeaders: Record<string, string | string[]> = {};
    upstream.headers.forEach((value, key) => {
      if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      outHeaders[key] = value;
    });

    // Inyectar siempre cabeceras CORS permisivas
    this.applyCorsHeaders(outHeaders, req);

    // Redirecciones hacia rutas distintas o dominios externos
    const location = upstream.headers.get("location");
    if (location && upstream.status >= 300 && upstream.status < 400) {
      try {
        const abs = new URL(location, currentTarget);
        const sessionHost = new URL(session.origin).host.toLowerCase();
        const targetHost = abs.host.toLowerCase();

        const isSameSite =
          abs.origin === session.origin ||
          targetHost === sessionHost ||
          targetHost === `www.${sessionHost}` ||
          sessionHost === `www.${targetHost}`;

        if (isSameSite) {
          session.origin = abs.origin;
          this.originToSession.set(abs.origin, session.id);
          const destLocation = `${proxyOrigin}${abs.pathname}${abs.search}${abs.hash}`;
          const currentRequestUrl = `${proxyOrigin}${req.url || "/"}`;
          if (destLocation !== currentRequestUrl) {
            outHeaders.location = destLocation;
          } else {
            // Evitar enviar auto-redirección si de algún modo sobrevivió
            delete outHeaders.location;
          }
        } else {
          // Dominio completamente distinto: sesión proxy propia
          const s = this.sessionFor(abs.origin);
          outHeaders.location = `${this.proxyOrigin(s.id)}${abs.pathname}${abs.search}${abs.hash}`;
        }
      } catch {
        // dejar location tal cual
      }

      if (accumulatedCookies.length) {
        outHeaders["set-cookie"] = accumulatedCookies.map((c) =>
          c
            .replace(/;\s*Domain=[^;]*/gi, "")
            .replace(/;\s*Secure/gi, "")
            .replace(/;\s*SameSite=[^;]*/gi, "")
        );
      }
      res.writeHead(upstream.status, outHeaders);
      res.end();
      return;
    }

    await this.sendUpstreamResponse(
      upstream,
      req,
      res,
      session,
      proxyOrigin,
      accumulatedCookies
    );
  }
}
