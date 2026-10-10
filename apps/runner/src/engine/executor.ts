import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { RecipeDsl, RecipeNode } from "@rpa/dsl";
import type { RunnerEventEmitter } from "../protocol/event-emitter.js";
import { executeNodeAction, type ExecutionContext } from "./action-handlers.js";
import { uploadArtifact } from "../storage/s3.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface ExecutionOptions {
  runId: string;
  recipe: RecipeDsl;
  parameters?: Record<string, unknown>;
  secrets?: Record<string, string>;
  headless?: boolean;
}

export class RecipeExecutor {
  private browser: Browser | null = null;

  constructor(private eventEmitter: RunnerEventEmitter) {}

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

  async execute(options: ExecutionOptions): Promise<{ success: boolean; durationMs: number; error?: string }> {
    await this.initialize();
    if (!this.browser) {
      throw new Error("No se pudo inicializar el navegador Chromium");
    }

    const { runId, recipe, parameters = {}, secrets = {} } = options;
    const startTime = Date.now();

    await this.eventEmitter.emitRunStarted(runId);

    const context: BrowserContext = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 RPAStudio/1.0",
    });

    const tempTraceDir = await fs.mkdtemp(path.join(os.tmpdir(), "rpa-trace-"));
    const tracePath = path.join(tempTraceDir, `${runId}-trace.zip`);

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });

    const page: Page = await context.newPage();

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

    let currentNodeId: string | undefined = recipe.entry;
    const visitedNodes = new Set<string>();
    let stepCount = 0;
    const maxGlobalSteps = 100; // Límite de seguridad contra loops infinitos accidentales

    try {
      while (currentNodeId && stepCount < maxGlobalSteps) {
        stepCount++;
        const node: RecipeNode | undefined = recipe.nodes[currentNodeId];
        if (!node) {
          throw new Error(`Nodo '${currentNodeId}' no encontrado en el grafo`);
        }

        const stepStartTime = Date.now();
        await this.eventEmitter.emitStepStarted(runId, node.id);

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

          if (node.onError === "continue") {
            currentNodeId = node.next;
          } else {
            throw nodeError; // "fail" o no manejado: detener ejecución
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      await this.eventEmitter.emitRunFinished(runId, "success", totalDuration);

      return { success: true, durationMs: totalDuration };
    } catch (fatalError: unknown) {
      const totalDuration = Date.now() - startTime;
      const fatalMsg = fatalError instanceof Error ? fatalError.message : String(fatalError);

      await this.eventEmitter.emitRunFinished(runId, "failed", totalDuration, fatalMsg);

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
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
