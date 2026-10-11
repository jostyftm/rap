import { chromium, type Browser, type Page } from "playwright";
import type { RedisEventEmitter } from "../protocol/event-emitter.js";
import { PICKER_JS } from "./picker-script.js";

interface ExternalSession {
  page: Page;
  recipeId: string;
}

/**
 * Chromium real con ventana visible (headed) con el mismo selector inyectado.
 * Respaldo para sitios que no funcionan a través del proxy embebido.
 */
export class ExternalBrowserManager {
  private browser: Browser | null = null;
  private sessions = new Map<string, ExternalSession>();

  constructor(private eventEmitter: RedisEventEmitter) {}

  private async emit(sessionId: string, recipeId: string, payload: unknown): Promise<void> {
    const emitter = this.eventEmitter as any;
    await emitter.redis.xadd(
      emitter.streamName,
      "*",
      "event",
      "live.event",
      "session_id",
      sessionId,
      "recipe_id",
      recipeId,
      "payload",
      JSON.stringify(payload),
      "timestamp",
      Date.now().toString()
    );
  }

  async start(opts: { sessionId: string; recipeId: string; url: string }): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: false,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
    }
    const context = await this.browser.newContext({ viewport: null });
    const page = await context.newPage();
    this.sessions.set(opts.sessionId, { page, recipeId: opts.recipeId });

    await page.exposeFunction("rpaLiveEmit", (msg: unknown) => {
      this.emit(opts.sessionId, opts.recipeId, msg).catch(() => undefined);
    });
    await page.addInitScript(PICKER_JS);

    page.on("close", () => {
      this.sessions.delete(opts.sessionId);
      this.emit(opts.sessionId, opts.recipeId, { type: "rpa:closed" }).catch(() => undefined);
    });

    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => {
      console.warn("[ExternalBrowser] Aviso en navegación inicial:", err.message);
    });
  }

  async command(sessionId: string, message: unknown): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    await s.page.evaluate((m) => {
      const w = window as any;
      if (w.__rpaReceive) w.__rpaReceive(m);
    }, message);
    return true;
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    await s.page.context().close().catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) await this.stop(id);
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
