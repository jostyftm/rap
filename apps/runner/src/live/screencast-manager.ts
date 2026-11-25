import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { captureAndUploadScreenshot } from "../engine/handlers/screenshot.handler.js";
import { PICKER_JS } from "./picker-script.js";
import { WsConnection } from "./ws-server.js";

export interface ScreencastViewport {
  width: number;
  height: number;
}

export interface ScreencastStartResult {
  sessionId: string;
  wsToken: string;
  origin: string;
  viewport: ScreencastViewport;
}

interface ScreencastSession {
  id: string;
  recipeId: string;
  wsToken: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  viewport: ScreencastViewport;
  clients: Set<WsConnection>;
  streaming: boolean;
  pendingAckTimers: Map<number, NodeJS.Timeout>;
  lastActivity: number;
  closed: boolean;
}

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_JPEG_QUALITY = 80;
const MAX_WS_BUFFERED_BYTES = 1024 * 1024;
const ACK_FALLBACK_TIMEOUT_MS = 300;

function clampViewport(width?: number, height?: number): ScreencastViewport {
  const w = Math.max(320, Math.min(1920, Math.round(Number(width) || 1280)));
  const h = Math.max(320, Math.min(1200, Math.round(Number(height) || 800)));
  return { width: w, height: h };
}

function normalizeHttpUrl(rawUrl: string): string {
  let clean = String(rawUrl || "").trim();
  if (clean && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(clean)) {
    clean = `https://${clean}`;
  }
  const parsed = new URL(clean);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Protocolo no soportado");
  }
  return parsed.href;
}

/**
 * Administra sesiones de Chromium headless transmitidas en vivo mediante
 * CDP Screencast (`Page.startScreencast`) sobre WebSockets hacia el editor.
 * Permite interactuar con sitios protegidos (YouTube, BotGuard, DRM/cookies)
 * con paridad total de navegador sin depender de proxy HTML ni iframes.
 */
export class ScreencastManager {
  private browser: Browser | null = null;
  private browserPromise: Promise<Browser> | null = null;
  private sessions = new Map<string, ScreencastSession>();
  private sweepTimer: NodeJS.Timeout;
  private readonly sessionTtlMs: number;
  private readonly jpegQuality: number;

  constructor(opts?: { sessionTtlMs?: number; jpegQuality?: number }) {
    this.sessionTtlMs = opts?.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.jpegQuality = opts?.jpegQuality ?? DEFAULT_JPEG_QUALITY;
    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, 60 * 1000);
    this.sweepTimer.unref();
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    if (!this.browserPromise) {
      this.browserPromise = chromium
        .launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu-sandbox",
            "--autoplay-policy=no-user-gesture-required",
            "--disable-blink-features=AutomationControlled",
          ],
        })
        .then((b) => {
          this.browser = b;
          this.browserPromise = null;
          b.on("disconnected", () => {
            if (this.browser === b) this.browser = null;
          });
          return b;
        })
        .catch((err) => {
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
  }

  async start(opts: {
    sessionId: string;
    recipeId?: string;
    url: string;
    width?: number;
    height?: number;
  }): Promise<ScreencastStartResult> {
    const targetUrl = normalizeHttpUrl(opts.url);
    const viewport = clampViewport(opts.width, opts.height);
    const browser = await this.ensureBrowser();

    const chromeVer = browser.version() || "131.0.0.0";
    const userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`;

    const context = await browser.newContext({
      viewport,
      userAgent,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const wsToken = randomBytes(16).toString("hex");

    const session: ScreencastSession = {
      id: opts.sessionId,
      recipeId: opts.recipeId || "default",
      wsToken,
      context,
      page,
      cdp,
      viewport,
      clients: new Set(),
      streaming: false,
      pendingAckTimers: new Map(),
      lastActivity: Date.now(),
      closed: false,
    };

    this.sessions.set(session.id, session);

    await page.exposeFunction("rpaLiveEmit", (msg: unknown) => {
      this.broadcastJson(session, msg);
    });
    await page.addInitScript(PICKER_JS);

    page.on("framenavigated", (frame) => {
      if (session.closed || frame !== page.mainFrame()) return;
      session.lastActivity = Date.now();
      const navUrl = page.url();
      page
        .title()
        .then((title) => {
          if (!session.closed) {
            this.broadcastJson(session, { type: "rpa:navigated", url: navUrl, title });
          }
        })
        .catch(() => {
          if (!session.closed) {
            this.broadcastJson(session, { type: "rpa:navigated", url: navUrl, title: "" });
          }
        });
    });

    page.on("close", () => {
      if (session.closed) return;
      this.broadcastJson(session, { type: "rpa:closed" });
      void this.stop(session.id);
    });

    cdp.on("Page.screencastFrame", (params: { data: string; metadata?: unknown; sessionId: number }) => {
      if (session.closed) return;

      const openClients = [...session.clients].filter((c) => c.readyState === WsConnection.OPEN);
      if (openClients.length === 0) {
        session.cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => undefined);
        return;
      }

      const frameBuf = Buffer.from(params.data, "base64");
      for (const client of openClients) {
        if (client.bufferedAmount < MAX_WS_BUFFERED_BYTES) {
          client.send(frameBuf);
        }
      }

      if (session.pendingAckTimers.has(params.sessionId)) {
        clearTimeout(session.pendingAckTimers.get(params.sessionId)!);
      }
      const fallback = setTimeout(() => {
        this.ackFrame(session, params.sessionId);
      }, ACK_FALLBACK_TIMEOUT_MS);
      fallback.unref();
      session.pendingAckTimers.set(params.sessionId, fallback);
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => {
      console.warn("[ScreencastManager] Aviso en navegación inicial:", err?.message || err);
    });

    return {
      sessionId: session.id,
      wsToken,
      origin: new URL(targetUrl).origin,
      viewport: { ...session.viewport },
    };
  }

  verifyWsToken(sessionId: string, token: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed || !token) return false;
    const expected = Buffer.from(session.wsToken, "utf8");
    const provided = Buffer.from(token, "utf8");
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  async attachClient(sessionId: string, ws: WsConnection): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) {
      ws.close(1008, "Session not found");
      return;
    }

    session.clients.add(ws);
    session.lastActivity = Date.now();

    const title = await session.page.title().catch(() => "");
    this.sendJson(ws, {
      type: "screencast:ready",
      sessionId: session.id,
      url: session.page.url(),
      title,
      viewport: session.viewport,
    });

    if (!session.streaming && !session.closed) {
      session.streaming = true;
      await session.cdp
        .send("Page.startScreencast", {
          format: "jpeg",
          quality: this.jpegQuality,
          maxWidth: session.viewport.width,
          maxHeight: session.viewport.height,
          everyNthFrame: 1,
        })
        .catch(() => {
          session.streaming = false;
        });
    }

    // Enviar un fotograma inicial inmediato para páginas estáticas sin repintado
    session.cdp
      .send("Page.captureScreenshot", { format: "jpeg", quality: this.jpegQuality })
      .then((res: { data?: string }) => {
        if (res?.data && ws.readyState === WsConnection.OPEN && !session.closed) {
          ws.send(Buffer.from(res.data, "base64"));
        }
      })
      .catch(() => undefined);

    ws.on("message", (raw: Buffer, isBinary: boolean) => {
      if (isBinary || session.closed) return;
      session.lastActivity = Date.now();
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;
      void this.handleClientMessage(session, ws, msg);
    });

    ws.on("close", () => {
      session.clients.delete(ws);
      if (session.clients.size === 0 && session.streaming && !session.closed) {
        session.streaming = false;
        this.clearAckTimers(session);
        session.cdp.send("Page.stopScreencast").catch(() => undefined);
      }
    });
  }

  private async handleClientMessage(
    session: ScreencastSession,
    ws: WsConnection,
    msg: Record<string, any>
  ): Promise<void> {
    if (session.closed) return;

    if (msg.type === "screencast:ack") {
      for (const frameId of [...session.pendingAckTimers.keys()]) {
        this.ackFrame(session, frameId);
      }
      return;
    }

    if (msg.type === "screencast:ping") {
      this.sendJson(ws, { type: "screencast:pong", ts: msg.ts });
      return;
    }

    if (msg.type === "input:mouse") {
      const rawAction = String(msg.action || "");
      if (
        rawAction !== "mousePressed" &&
        rawAction !== "mouseReleased" &&
        rawAction !== "mouseMoved" &&
        rawAction !== "mouseWheel"
      ) {
        return;
      }
      const x = Math.round(Number(msg.x) || 0);
      const y = Math.round(Number(msg.y) || 0);
      const modifiers = Number(msg.modifiers) || 0;
      const rawBtn = String(msg.button || "");
      const button: "none" | "left" | "middle" | "right" | "back" | "forward" =
        rawBtn === "left" ||
        rawBtn === "middle" ||
        rawBtn === "right" ||
        rawBtn === "back" ||
        rawBtn === "forward" ||
        rawBtn === "none"
          ? rawBtn
          : rawAction === "mouseMoved"
            ? "none"
            : "left";

      const payload: {
        type: "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel";
        x: number;
        y: number;
        modifiers: number;
        button?: "none" | "left" | "middle" | "right" | "back" | "forward";
        buttons?: number;
        clickCount?: number;
        deltaX?: number;
        deltaY?: number;
      } = { type: rawAction, x, y, modifiers };

      if (rawAction === "mousePressed" || rawAction === "mouseReleased") {
        payload.button = button;
        payload.clickCount = Math.max(1, Number(msg.clickCount) || 1);
        if (typeof msg.buttons === "number") payload.buttons = msg.buttons;
      } else if (rawAction === "mouseMoved") {
        payload.button = button;
        if (typeof msg.buttons === "number") payload.buttons = msg.buttons;
      } else if (rawAction === "mouseWheel") {
        payload.deltaX = Number(msg.deltaX) || 0;
        payload.deltaY = Number(msg.deltaY) || 0;
      }

      await session.cdp.send("Input.dispatchMouseEvent", payload).catch(() => undefined);
      return;
    }

    if (msg.type === "input:key") {
      const action = msg.action === "keyUp" ? "keyUp" : "keyDown";
      const text = typeof msg.text === "string" && msg.text.length > 0 ? msg.text : undefined;
      const modifiers = Number(msg.modifiers) || 0;
      const vk = typeof msg.windowsVirtualKeyCode === "number" ? msg.windowsVirtualKeyCode : undefined;

      const payload: {
        type: "keyDown" | "keyUp" | "rawKeyDown" | "char";
        modifiers: number;
        key?: string;
        code?: string;
        windowsVirtualKeyCode?: number;
        nativeVirtualKeyCode?: number;
        text?: string;
        unmodifiedText?: string;
      } = {
        type: action === "keyUp" ? "keyUp" : text ? "keyDown" : "rawKeyDown",
        modifiers,
      };
      if (typeof msg.key === "string") payload.key = msg.key;
      if (typeof msg.code === "string") payload.code = msg.code;
      if (vk !== undefined) {
        payload.windowsVirtualKeyCode = vk;
        payload.nativeVirtualKeyCode = vk;
      }
      if (action === "keyDown" && text) {
        payload.text = text;
        payload.unmodifiedText = text;
      }

      await session.cdp.send("Input.dispatchKeyEvent", payload).catch(() => undefined);
      return;
    }

    if (msg.type === "input:text") {
      const text = typeof msg.text === "string" ? msg.text : "";
      if (text) {
        await session.cdp.send("Input.insertText", { text }).catch(() => undefined);
      }
      return;
    }

    if (msg.type === "browser:navigate") {
      try {
        const cleanUrl = normalizeHttpUrl(String(msg.url || ""));
        await session.page.goto(cleanUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => {
          console.warn("[ScreencastManager] Aviso en browser:navigate:", err?.message || err);
        });
      } catch {
        // Ignorar URL inválida
      }
      return;
    }

    if (msg.type === "browser:back") {
      await session.page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => undefined);
      return;
    }

    if (msg.type === "browser:forward") {
      await session.page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => undefined);
      return;
    }

    if (msg.type === "browser:reload") {
      await session.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
      return;
    }

    if (msg.type === "browser:resize") {
      const nextVp = clampViewport(msg.width, msg.height);
      if (nextVp.width === session.viewport.width && nextVp.height === session.viewport.height) {
        return;
      }
      session.viewport = nextVp;
      await session.page.setViewportSize(nextVp).catch(() => undefined);

      if (session.streaming) {
        await session.cdp.send("Page.stopScreencast").catch(() => undefined);
        await session.cdp
          .send("Page.startScreencast", {
            format: "jpeg",
            quality: this.jpegQuality,
            maxWidth: nextVp.width,
            maxHeight: nextVp.height,
            everyNthFrame: 1,
          })
          .catch(() => undefined);
      }

      const title = await session.page.title().catch(() => "");
      this.broadcastJson(session, {
        type: "screencast:ready",
        sessionId: session.id,
        url: session.page.url(),
        title,
        viewport: nextVp,
      });

      session.cdp
        .send("Page.captureScreenshot", { format: "jpeg", quality: this.jpegQuality })
        .then((res: { data?: string }) => {
          if (!res?.data || session.closed) return;
          const buf = Buffer.from(res.data, "base64");
          for (const client of session.clients) {
            if (client.readyState === WsConnection.OPEN && client.bufferedAmount < MAX_WS_BUFFERED_BYTES) {
              client.send(buf);
            }
          }
        })
        .catch(() => undefined);
      return;
    }

    if (msg.type.startsWith("rpa:")) {
      await this.command(session.id, msg);
    }
  }

  async command(sessionId: string, message: unknown): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return false;
    session.lastActivity = Date.now();

    const msg = message as Record<string, any>;
    if (msg && typeof msg === "object" && msg.type === "rpa:exec" && msg.action === "screenshot") {
      try {
        const captured = await captureAndUploadScreenshot(session.page, {
          scopePath: `live/${session.recipeId || session.id}/screenshots`,
          nodeId: String(msg.nodeId || "screenshot"),
          name: typeof msg.params?.name === "string" ? msg.params.name : undefined,
          fullPage: Boolean(msg.params?.fullPage),
          locator: msg.locator,
          timeout: Number(msg.timeout) || 5000,
        });

        this.broadcastJson(session, {
          type: "rpa:exec:result",
          reqId: msg.reqId,
          nodeId: msg.nodeId,
          action: "screenshot",
          ok: true,
          strategy:
            captured.resolvedLocator?.strategy ||
            (msg.params?.fullPage ? "fullPage" : "viewport"),
          output: captured.output,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.broadcastJson(session, {
          type: "rpa:exec:result",
          reqId: msg.reqId,
          nodeId: msg.nodeId,
          action: "screenshot",
          ok: false,
          error: errorMsg,
        });
      }
      return true;
    }

    await session.page
      .evaluate((m) => {
        const w = window as any;
        if (w.__rpaReceive) w.__rpaReceive(m);
      }, message)
      .catch(() => undefined);
    return true;
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.closed = true;
    this.sessions.delete(sessionId);
    this.clearAckTimers(session);

    for (const client of [...session.clients]) {
      client.close(1000, "Session stopped");
    }
    session.clients.clear();

    if (session.streaming) {
      session.streaming = false;
      await session.cdp.send("Page.stopScreencast").catch(() => undefined);
    }
    await session.cdp.detach().catch(() => undefined);
    await session.context.close().catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    clearInterval(this.sweepTimer);
    for (const id of [...this.sessions.keys()]) {
      await this.stop(id);
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  private ackFrame(session: ScreencastSession, frameSessionId: number): void {
    const timer = session.pendingAckTimers.get(frameSessionId);
    if (timer) {
      clearTimeout(timer);
      session.pendingAckTimers.delete(frameSessionId);
    }
    if (!session.closed) {
      session.cdp.send("Page.screencastFrameAck", { sessionId: frameSessionId }).catch(() => undefined);
    }
  }

  private clearAckTimers(session: ScreencastSession): void {
    for (const timer of session.pendingAckTimers.values()) {
      clearTimeout(timer);
    }
    session.pendingAckTimers.clear();
  }

  private sendJson(ws: WsConnection, payload: unknown): void {
    if (ws.readyState === WsConnection.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private broadcastJson(session: ScreencastSession, payload: unknown): void {
    if (session.closed || session.clients.size === 0) return;
    const text = JSON.stringify(payload);
    for (const client of session.clients) {
      if (client.readyState === WsConnection.OPEN) {
        client.send(text);
      }
    }
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.clients.size === 0 && now - session.lastActivity > this.sessionTtlMs) {
        await this.stop(id);
      }
    }
  }
}
