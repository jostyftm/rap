import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { RecipeDsl, RecipeNode } from "@rpa/dsl";
import type { RunnerEventEmitter } from "../protocol/event-emitter.js";
import { executeNodeAction, type ExecutionContext } from "./action-handlers.js";
import { resolveLocator } from "./locator-resolver.js";
import { uploadArtifact } from "../storage/s3.js";
import type { Redis } from "ioredis";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface ExecutionDisplayOptions {
  display?: "headless" | "headed" | "live";
  slowMoMs?: number;
  highlight?: boolean;
  keepOpenMs?: number;
}

export interface ExecutionOptions {
  runId: string;
  recipe: RecipeDsl;
  parameters?: Record<string, unknown>;
  secrets?: Record<string, string>;
  options?: ExecutionDisplayOptions;
}

export class RecipeExecutor {
  private sharedBrowser: Browser | null = null;

  constructor(
    private eventEmitter: RunnerEventEmitter,
    private redis?: Redis
  ) {}

  async initializeShared(): Promise<void> {
    if (!this.sharedBrowser) {
      this.sharedBrowser = await chromium.launch({
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

  async execute(options: ExecutionOptions): Promise<{ success: boolean; durationMs: number; error?: string }> {
    const { runId, recipe, parameters = {}, secrets = {}, options: displayOpts = {} } = options;
    const isHeaded = displayOpts.display === "headed";
    const slowMo = displayOpts.slowMoMs ?? (isHeaded ? 350 : 0);
    const highlight = displayOpts.highlight ?? isHeaded;
    const keepOpenMs = displayOpts.keepOpenMs ?? (isHeaded ? 4000 : 0);

    let dedicatedBrowser: Browser | null = null;
    let browser: Browser;

    if (isHeaded) {
      dedicatedBrowser = await chromium.launch({
        headless: false,
        slowMo: slowMo > 0 ? slowMo : 150,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--start-maximized",
        ],
      });
      browser = dedicatedBrowser;
    } else {
      await this.initializeShared();
      if (!this.sharedBrowser) {
        throw new Error("No se pudo inicializar el navegador Chromium");
      }
      browser = this.sharedBrowser;
    }

    const startTime = Date.now();
    await this.eventEmitter.emitRunStarted(runId);
    await this.eventEmitter.emitRunLog(
      runId,
      "info",
      `Ejecución iniciada en modo [${isHeaded ? "VENTANA VISIBLE (Headed)" : "SEGUNDO PLANO (Headless)"}]`,
      undefined,
      "runner"
    );

    const context: BrowserContext = await browser.newContext({
      viewport: isHeaded ? null : { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 RPAStudio/1.0",
    });

    const tempTraceDir = await fs.mkdtemp(path.join(os.tmpdir(), "rpa-trace-"));
    const tracePath = path.join(tempTraceDir, `${runId}-trace.zip`);

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });

    const page: Page = await context.newPage();

    let currentNodeId: string | undefined = recipe.entry;

    // Escuchar eventos de consola y red del navegador para enriquecer logs
    page.on("console", (msg) => {
      const type = msg.type();
      const level = type === "error" ? "error" : type === "warning" ? "warn" : "info";
      this.eventEmitter.emitRunLog(
        runId,
        level,
        `[Consola ${type}] ${msg.text()}`,
        currentNodeId,
        "browser"
      ).catch(() => undefined);
    });

    page.on("pageerror", (err) => {
      this.eventEmitter.emitRunLog(
        runId,
        "error",
        `[Error JS en página] ${err.message}`,
        currentNodeId,
        "browser"
      ).catch(() => undefined);
    });

    page.on("requestfailed", (req) => {
      this.eventEmitter.emitRunLog(
        runId,
        "warn",
        `[Fallo de red] ${req.method()} ${req.url()}: ${req.failure()?.errorText || "desconocido"}`,
        currentNodeId,
        "network"
      ).catch(() => undefined);
    });

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        this.eventEmitter.emitRunLog(
          runId,
          "info",
          `Navegación detectada: ${frame.url()}`,
          currentNodeId,
          "runner"
        ).catch(() => undefined);
      }
    });

    // Inicializar variables
    const variables: Record<string, unknown> = { ...parameters };
    for (const v of recipe.variables || []) {
      if (variables[v.name] === undefined && v.defaultValue !== undefined) {
        variables[v.name] = v.defaultValue;
      }
    }

    const execContext: ExecutionContext = {
      runId,
      variables,
      secrets,
      stepResults: {},
    };

    const visitedNodes = new Set<string>();
    let stepCount = 0;
    const maxGlobalSteps = 150;

    // Función auxiliar para revisar pausa / cancelación
    const checkControl = async (): Promise<"continue" | "stop"> => {
      if (!this.redis) return "continue";
      const controlKey = `rpa:run:${runId}:control`;
      let control = await this.redis.get(controlKey);
      if (control === "stop") {
        await this.eventEmitter.emitRunStopped(runId);
        await this.eventEmitter.emitRunLog(runId, "warn", "Ejecución detenida por solicitud del usuario.", currentNodeId, "runner");
        return "stop";
      }
      if (control === "pause") {
        await this.eventEmitter.emitRunPaused(runId);
        await this.eventEmitter.emitRunLog(runId, "warn", "Ejecución pausada. Esperando reanudación...", currentNodeId, "runner");
        while (true) {
          await new Promise((r) => setTimeout(r, 600));
          control = await this.redis.get(controlKey);
          if (control === "resume") {
            await this.redis.del(controlKey);
            await this.eventEmitter.emitRunResumed(runId);
            await this.eventEmitter.emitRunLog(runId, "info", "Ejecución reanudada.", currentNodeId, "runner");
            break;
          }
          if (control === "stop") {
            await this.eventEmitter.emitRunStopped(runId);
            await this.eventEmitter.emitRunLog(runId, "warn", "Ejecución detenida por solicitud del usuario.", currentNodeId, "runner");
            return "stop";
          }
        }
      }
      return "continue";
    };

    try {
      while (currentNodeId && stepCount < maxGlobalSteps) {
        // Verificar control de usuario antes de cada paso
        const ctrl = await checkControl();
        if (ctrl === "stop") {
          throw new Error("Ejecución detenida por el usuario");
        }

        stepCount++;
        const node: RecipeNode | undefined = recipe.nodes[currentNodeId];
        if (!node) {
          throw new Error(`Nodo '${currentNodeId}' no encontrado en el grafo`);
        }

        const stepStartTime = Date.now();
        await this.eventEmitter.emitStepStarted(runId, node.id);
        await this.eventEmitter.emitRunLog(
          runId,
          "info",
          `Paso [${node.id}] (${node.type}): ${node.description || "Iniciando acción"}`,
          node.id,
          "runner"
        );

        // Si estamos en ventana visible o highlight está activo, resaltar elemento antes de ejecutar
        if (highlight && "locator" in node && (node as any).locator) {
          try {
            const resolved = await resolveLocator(page, (node as any).locator, 2500);
            await resolved.locator.highlight().catch(() => undefined);
            if (slowMo > 0) {
              await page.waitForTimeout(Math.min(slowMo, 400));
            }
          } catch {
            // Ignorar fallo de preview de highlight
          }
        }

        try {
          const result = await executeNodeAction(page, node, execContext);
          const stepDurationMs = Date.now() - stepStartTime;

          // Política de capturas de pantalla
          let finalScreenshotPath = result.screenshotPath;
          if (node.screenshot === "always" && !finalScreenshotPath) {
            const buf = await page.screenshot({ fullPage: false });
            const s3Key = `runs/${runId}/screenshots/${node.id}-${Date.now()}.png`;
            await uploadArtifact(s3Key, buf);
            finalScreenshotPath = s3Key;
          }

          await this.eventEmitter.emitStepFinished(
            runId,
            node.id,
            stepDurationMs,
            result.resolvedLocator?.strategy,
            result.resolvedLocator?.value,
            finalScreenshotPath
          );

          await this.eventEmitter.emitRunLog(
            runId,
            "success",
            `Paso [${node.id}] completado exitosamente en ${stepDurationMs}ms${
              result.resolvedLocator ? ` (usó ${result.resolvedLocator.strategy}: ${result.resolvedLocator.value})` : ""
            }`,
            node.id,
            "runner",
            {
              duration_ms: stepDurationMs,
              strategy: result.resolvedLocator?.strategy,
              value: result.resolvedLocator?.value,
            }
          );

          visitedNodes.add(node.id);
          currentNodeId = result.nextNodeId;
        } catch (nodeError: unknown) {
          const stepDurationMs = Date.now() - stepStartTime;
          const errorMsg = nodeError instanceof Error ? nodeError.message : String(nodeError);

          // Capturar screenshot de error si la política lo indica
          let errorScreenshotPath: string | undefined;
          if (node.screenshot !== "never") {
            try {
              const errBuf = await page.screenshot({ fullPage: false });
              const s3Key = `runs/${runId}/screenshots/error-${node.id}-${Date.now()}.png`;
              await uploadArtifact(s3Key, errBuf);
              errorScreenshotPath = s3Key;
            } catch {
              // Ignorar fallo de captura de error
            }
          }

          await this.eventEmitter.emitStepFailed(
            runId,
            node.id,
            errorMsg,
            stepDurationMs,
            errorScreenshotPath
          );

          await this.eventEmitter.emitRunLog(
            runId,
            "error",
            `Paso [${node.id}] falló tras ${stepDurationMs}ms: ${errorMsg}`,
            node.id,
            "runner",
            { error: errorMsg, duration_ms: stepDurationMs }
          );

          if (node.onError === "continue") {
            currentNodeId = node.next;
          } else {
            throw nodeError; // "fail" o no manejado: detener ejecución
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      await this.eventEmitter.emitRunFinished(runId, "success", totalDuration);
      await this.eventEmitter.emitRunLog(
        runId,
        "success",
        `Ejecución finalizada con éxito en ${(totalDuration / 1000).toFixed(2)}s (${stepCount} pasos)`,
        undefined,
        "runner"
      );

      // Si fue ventana headed, mantener abierta un momento para que el usuario aprecie el estado final
      if (isHeaded && keepOpenMs > 0) {
        await new Promise((r) => setTimeout(r, keepOpenMs));
      }

      return { success: true, durationMs: totalDuration };
    } catch (fatalError: unknown) {
      const totalDuration = Date.now() - startTime;
      const fatalMsg = fatalError instanceof Error ? fatalError.message : String(fatalError);

      await this.eventEmitter.emitRunFinished(runId, "failed", totalDuration, fatalMsg);
      await this.eventEmitter.emitRunLog(
        runId,
        "error",
        `Ejecución interrumpida: ${fatalMsg}`,
        undefined,
        "runner"
      );

      if (isHeaded && keepOpenMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(keepOpenMs, 2000)));
      }

      return { success: false, durationMs: totalDuration, error: fatalMsg };
    } finally {
      // Guardar y subir traza de Playwright a S3
      try {
        await context.tracing.stop({ path: tracePath });
        const traceBuffer = await fs.readFile(tracePath);
        await uploadArtifact(`runs/${runId}/trace.zip`, traceBuffer, "application/zip");
        await fs.rm(tempTraceDir, { recursive: true, force: true });
      } catch {
        // Ignorar fallos de traza
      }

      await context.close().catch(() => undefined);
      if (dedicatedBrowser) {
        await dedicatedBrowser.close().catch(() => undefined);
      }
    }
  }

  async close(): Promise<void> {
    if (this.sharedBrowser) {
      await this.sharedBrowser.close().catch(() => undefined);
      this.sharedBrowser = null;
    }
  }
}
