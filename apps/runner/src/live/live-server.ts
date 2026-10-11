import http from "node:http";
import { randomBytes } from "node:crypto";
import { PICKER_JS } from "./picker-script.js";
import type { ExternalBrowserManager } from "./external-browser.js";

interface LiveSession {
  id: string;
  origin: string;
  lastUsed: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const STRIP_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
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

  constructor(
    private port: number,
    private token: string,
    private external: ExternalBrowserManager
  ) {}

  start(): void {
    this.server = http.createServer((req, res) => {
      this.route(req, res).catch((err) => {
        console.error("[LiveServer] Error:", err);
        if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
        res.end(`RPA Live proxy error: ${err?.message ?? err}`);
      });
    });
    this.server.listen(this.port, "0.0.0.0", () => {
      console.log(`[LiveServer] Sitio en vivo (proxy + control) escuchando en :${this.port}`);
    });
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
  }

  async close(): Promise<void> {
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
    const s: LiveSession = { id: randomBytes(6).toString("hex"), origin, lastUsed: Date.now() };
    this.sessions.set(s.id, s);
    this.originToSession.set(origin, s.id);
    return s;
  }

  private proxyOrigin(sid: string): string {
    return `http://${sid}.localhost:${this.port}`;
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const host = (req.headers.host || "").toLowerCase();
    const urlPath = req.url || "/";

    if (urlPath.startsWith("/__rpa/picker.js")) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(PICKER_JS);
      return;
    }

    const match = host.match(/^([a-f0-9]{12})\.localhost(?::\d+)?$/);
    if (match) {
      await this.handleProxy(match[1], req, res);
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
      let target: URL;
      try {
        target = new URL(body.url);
        if (!/^https?:$/.test(target.protocol)) throw new Error("protocolo no soportado");
      } catch {
        return this.json(res, 422, { error: "URL inválida" });
      }
      const session = this.sessionFor(target.origin);
      return this.json(res, 201, {
        session_id: session.id,
        origin: target.origin,
        proxy_url: `${this.proxyOrigin(session.id)}${target.pathname}${target.search}${target.hash}`,
      });
    }

    const cmd = path.match(/^\/live\/sessions\/([a-z0-9_-]+)\/command$/i);
    if (req.method === "POST" && cmd) {
      const body = JSON.parse((await this.readBody(req)).toString() || "{}");
      const ok = await this.external.command(cmd[1], body.message);
      return this.json(res, ok ? 200 : 404, { ok });
    }

    const del = path.match(/^\/live\/sessions\/([a-z0-9_-]+)$/i);
    if (req.method === "DELETE" && del) {
      await this.external.stop(del[1]);
      const s = this.sessions.get(del[1]);
      if (s) {
        this.sessions.delete(s.id);
        this.originToSession.delete(s.origin);
      }
      return this.json(res, 200, { ok: true });
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
    const host = new URL(origin).host;
    const proxyHost = new URL(proxyOrigin).host;
    return text.split(origin).join(proxyOrigin).split(`//${host}`).join(`//${proxyHost}`);
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
    const targetUrl = session.origin + (req.url || "/");

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      const key = k.toLowerCase();
      if (["host", "connection", "accept-encoding", "if-none-match", "if-modified-since", "content-length"].includes(key)) continue;
      headers[key] = Array.isArray(v) ? v.join(", ") : v;
    }
    headers["accept-encoding"] = "identity";
    if (headers.origin) headers.origin = session.origin;
    if (headers.referer) headers.referer = headers.referer.split(proxyOrigin).join(session.origin);

    const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
    const body = hasBody ? await this.readBody(req) : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.length ? new Uint8Array(body) : undefined,
      redirect: "manual",
    });

    const outHeaders: Record<string, string | string[]> = {};
    upstream.headers.forEach((value, key) => {
      if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      outHeaders[key] = value;
    });

    // Redirecciones: mismo origen -> proxy actual; otro origen -> su propia sesión proxy
    const location = upstream.headers.get("location");
    if (location) {
      try {
        const abs = new URL(location, targetUrl);
        const s = abs.origin === session.origin ? session : this.sessionFor(abs.origin);
        outHeaders.location = `${this.proxyOrigin(s.id)}${abs.pathname}${abs.search}${abs.hash}`;
      } catch {
        // dejar location tal cual
      }
    }

    const setCookies = (upstream.headers as any).getSetCookie?.() as string[] | undefined;
    if (setCookies && setCookies.length) {
      outHeaders["set-cookie"] = setCookies.map((c) =>
        c
          .replace(/;\s*Domain=[^;]*/gi, "")
          .replace(/;\s*Secure/gi, "")
          .replace(/;\s*SameSite=[^;]*/gi, "")
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    const buf = Buffer.from(await upstream.arrayBuffer());

    if (TEXT_TYPES.test(contentType) && buf.length > 0) {
      let text = buf.toString("utf8");
      text = this.rewriteText(text, session.origin, proxyOrigin);
      if (/text\/html/i.test(contentType)) {
        const inject =
          `<script>window.__RPA_ORIGIN__=${JSON.stringify(session.origin)};</script>` +
          `<script src="/__rpa/picker.js"></script>`;
        text = /<head[^>]*>/i.test(text)
          ? text.replace(/<head[^>]*>/i, (m) => m + inject)
          : inject + text;
      }
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
}
