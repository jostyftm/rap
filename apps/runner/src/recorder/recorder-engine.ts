import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { RedisEventEmitter } from "../protocol/event-emitter.js";

export interface RecorderOptions {
  sessionId: string;
  recipeId: string;
  initialUrl: string;
}

export class RecorderEngine {
  private browser: Browser | null = null;
  private activeContexts: Map<string, { context: BrowserContext; page: Page }> = new Map();

  constructor(private eventEmitter: RedisEventEmitter) {}

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: process.env.RUNNER_HEADLESS !== "false",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }
  }

  async start(options: RecorderOptions): Promise<void> {
    await this.initialize();
    if (!this.browser) {
      throw new Error("No se pudo iniciar Chromium para la grabación");
    }

    const { sessionId, recipeId, initialUrl } = options;

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 RPAStudio-Recorder/1.0",
    });

    const page = await context.newPage();
    this.activeContexts.set(sessionId, { context, page });

    // Exponer función de captura hacia el navegador
    await page.exposeFunction("rpaCaptureAction", async (actionData: any) => {
      console.log(`[RecorderEngine] Acción capturada en sesión ${sessionId}:`, actionData.type);

      // Generar thumbnail visual del elemento o región interactuada
      let thumbnail: string | undefined;
      try {
        let clipX = actionData.clickX ?? actionData.box?.x ?? 0;
        let clipY = actionData.clickY ?? actionData.box?.y ?? 0;
        let clipWidth = actionData.box?.width ?? 200;
        let clipHeight = actionData.box?.height ?? 100;

        if (clipWidth > 0 && clipWidth <= 450 && clipHeight > 0 && clipHeight <= 300) {
          clipX = Math.max(0, (actionData.box?.x ?? 0) - 8);
          clipY = Math.max(0, (actionData.box?.y ?? 0) - 8);
          clipWidth = Math.min(1280 - clipX, clipWidth + 16);
          clipHeight = Math.min(800 - clipY, clipHeight + 16);
        } else {
          clipX = Math.max(0, clipX - 110);
          clipY = Math.max(0, clipY - 60);
          clipWidth = Math.min(1280 - clipX, 220);
          clipHeight = Math.min(800 - clipY, 120);
        }

        if (clipWidth >= 10 && clipHeight >= 10) {
          const buf = await page.screenshot({
            clip: { x: clipX, y: clipY, width: clipWidth, height: clipHeight },
            type: "jpeg",
            quality: 65,
          });
          thumbnail = `data:image/jpeg;base64,${buf.toString("base64")}`;
        }
      } catch (err: any) {
        console.warn("[RecorderEngine] No se pudo generar recorte de elemento:", err.message);
      }

      actionData.preview = {
        image: thumbnail,
        targetScope: "browser",
        capturedAt: Date.now(),
        elementSnippet: actionData.description || actionData.locator?.primary?.value || actionData.type,
      };

      await (this.eventEmitter as any).redis.xadd(
        (this.eventEmitter as any).streamName,
        "*",
        "event",
        "recorder.action",
        "session_id",
        sessionId,
        "recipe_id",
        recipeId,
        "action",
        JSON.stringify(actionData),
        "timestamp",
        Date.now().toString()
      );
    });

    // Inyectar script de captura en cada navegación
    await page.addInitScript(`
      (function() {
        if (window.__rpaRecorderInjected) return;
        window.__rpaRecorderInjected = true;

        function getCandidates(el) {
          const list = [];
          if (!el || !(el instanceof HTMLElement)) return { primary: { strategy: 'css', value: 'body', score: 50 }, fallbacks: [] };

          const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
          if (testId) {
            list.push({ strategy: 'testid', value: testId, score: 95 });
          }

          if (el.id && !/^[0-9]+$/.test(el.id)) {
            list.push({ strategy: 'css', value: '#' + el.id, score: 85 });
          }

          const name = el.getAttribute('name');
          if (name) {
            list.push({ strategy: 'css', value: "[name='" + name + "']", score: 80 });
          }

          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) {
            list.push({ strategy: 'role', value: "button[name='" + ariaLabel + "']", score: 80 });
          }

          const tag = el.tagName.toLowerCase();
          if (tag === 'button' || tag === 'a') {
            const text = (el.innerText || '').trim();
            if (text && text.length > 0 && text.length < 35) {
              list.push({ strategy: 'role', value: "button[name='" + text + "']", score: 80 });
            }
          }

          list.push({ strategy: 'css', value: tag, score: 50 });

          return {
            primary: list[0] || { strategy: 'css', value: tag, score: 50 },
            fallbacks: list.slice(1)
          };
        }

        function getElementBox(el) {
          if (!el || !(el instanceof HTMLElement)) return { x: 0, y: 0, width: 0, height: 0 };
          const rect = el.getBoundingClientRect();
          return {
            x: Math.max(0, Math.round(rect.left)),
            y: Math.max(0, Math.round(rect.top)),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
          };
        }

        // 1. Capturar clicks
        document.addEventListener('click', function(e) {
          const target = e.target;
          if (!target || !(target instanceof HTMLElement)) return;

          // Ignorar clicks en el body vacío
          if (target === document.body || target === document.documentElement) return;

          const loc = getCandidates(target);
          const box = getElementBox(target);
          window.rpaCaptureAction({
            type: 'click',
            locator: loc,
            params: { button: e.button === 2 ? 'right' : 'left' },
            url: window.location.href,
            clickX: e.clientX,
            clickY: e.clientY,
            box: box,
            description: 'Clic en ' + (loc.primary.value || target.tagName)
          });
        }, true);

        // 2. Capturar escritura (input/change con debounce)
        let inputTimer = null;
        document.addEventListener('input', function(e) {
          const target = e.target;
          if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

          clearTimeout(inputTimer);
          inputTimer = setTimeout(function() {
            const loc = getCandidates(target);
            const box = getElementBox(target);
            window.rpaCaptureAction({
              type: 'type',
              locator: loc,
              params: { text: target.value, clear: true },
              url: window.location.href,
              box: box,
              description: 'Escribir en ' + (loc.primary.value || target.name || 'campo')
            });
          }, 400);
        }, true);

        // 2b. Capturar tecla Enter en campos de texto
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            const target = e.target;
            if (target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
              clearTimeout(inputTimer);
              const loc = getCandidates(target);
              const box = getElementBox(target);
              window.rpaCaptureAction({
                type: 'type',
                locator: loc,
                params: { text: target.value, clear: true, pressEnter: true },
                url: window.location.href,
                box: box,
                description: 'Escribir y pulsar Enter en ' + (loc.primary.value || target.name || 'campo')
              });
            }
          }
        }, true);

        // 3. Capturar selects
        document.addEventListener('change', function(e) {
          const target = e.target;
          if (!target || !(target instanceof HTMLSelectElement)) return;

          const loc = getCandidates(target);
          const box = getElementBox(target);
          window.rpaCaptureAction({
            type: 'select',
            locator: loc,
            params: { value: target.value },
            url: window.location.href,
            box: box,
            description: 'Seleccionar opción en ' + loc.primary.value
          });
        }, true);
      })();
    `);

    // Navegar en la página primero para tener captura visual de destino
    try {
      await page.goto(initialUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log(`[RecorderEngine] Navegación inicial completada para sesión ${sessionId}`);
    } catch (err: any) {
      console.warn(`[RecorderEngine] Aviso durante navegación inicial:`, err.message);
    }

    let initialThumbnail: string | undefined;
    try {
      const buf = await page.screenshot({
        clip: { x: 0, y: 0, width: 320, height: 180 },
        type: "jpeg",
        quality: 60,
      });
      initialThumbnail = `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      // Ignorar si no está disponible
    }

    // Emitir acción inicial de navegación con previsualización
    await (this.eventEmitter as any).redis.xadd(
      (this.eventEmitter as any).streamName,
      "*",
      "event",
      "recorder.action",
      "session_id",
      sessionId,
      "recipe_id",
      recipeId,
      "action",
      JSON.stringify({
        type: "navigate",
        params: { url: initialUrl, waitUntil: "domcontentloaded" },
        url: initialUrl,
        description: `Navegar a ${initialUrl}`,
        preview: {
          image: initialThumbnail,
          targetScope: "browser",
          capturedAt: Date.now(),
          elementSnippet: `Navegar a ${initialUrl}`,
        },
      }),
      "timestamp",
      Date.now().toString()
    );
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.activeContexts.get(sessionId);
    if (session) {
      try {
        await session.context.close();
      } catch {
        // Ignorar
      }
      this.activeContexts.delete(sessionId);
      console.log(`[RecorderEngine] Sesión de grabación ${sessionId} cerrada.`);
    }
  }

  async closeAll(): Promise<void> {
    for (const [id] of this.activeContexts) {
      await this.stop(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
