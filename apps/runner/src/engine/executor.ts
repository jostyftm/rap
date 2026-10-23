import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { RecipeDsl, RecipeNode, RetryPolicy, TryCatchNode } from "@rpa/dsl";
import type { RunnerEventEmitter } from "../protocol/event-emitter.js";
import { executeNodeAction, type ExecutionContext, type ActionResult } from "./action-handlers.js";
import { resolveLocator } from "./locator-resolver.js";
import { uploadArtifact } from "../storage/s3.js";
import type { Redis } from "ioredis";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  delayMs: 1000,
  backoff: "exponential",
};

/** Error interno para distinguir una parada del usuario de un fallo capturable. */
class ExecutionStoppedError extends Error {
  constructor() {
    super("Ejecución detenida por el usuario");
    this.name = "ExecutionStoppedError";
  }
}

function resolveRetryPolicy(node: RecipeNode): RetryPolicy {
  const policy = node.retry ?? DEFAULT_RETRY_POLICY;
  const maxAttempts = Math.min(10, Math.max(1, Math.floor(policy.maxAttempts)));
  const delayMs = Math.min(60000, Math.max(0, Math.floor(policy.delayMs)));

  return {
    maxAttempts,
    delayMs,
    backoff: policy.backoff === "fixed" ? "fixed" : "exponential",
  };
}

function retryDelayMs(policy: RetryPolicy, failedAttempt: number): number {
  if (policy.backoff === "fixed") {
    return policy.delayMs;
  }

  return policy.delayMs * 2 ** Math.max(0, failedAttempt - 1);
}

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

    let activeNodeId: string | undefined = recipe.entry;

    // Escuchar eventos de consola y red del navegador para enriquecer logs
    page.on("console", (msg) => {
      const type = msg.type();
      const level = type === "error" ? "error" : type === "warning" ? "warn" : "info";
      this.eventEmitter.emitRunLog(
        runId,
        level,
        `[Consola ${type}] ${msg.text()}`,
        activeNodeId,
        "browser"
      ).catch(() => undefined);
    });

    page.on("pageerror", (err) => {
      this.eventEmitter.emitRunLog(
        runId,
        "error",
        `[Error JS en página] ${err.message}`,
        activeNodeId,
        "browser"
      ).catch(() => undefined);
    });

    page.on("requestfailed", (req) => {
      this.eventEmitter.emitRunLog(
        runId,
        "warn",
        `[Fallo de red] ${req.method()} ${req.url()}: ${req.failure()?.errorText || "desconocido"}`,
        activeNodeId,
        "network"
      ).catch(() => undefined);
    });

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        this.eventEmitter.emitRunLog(
          runId,
          "info",
          `Navegación detectada: ${frame.url()}`,
          activeNodeId,
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
    let stepMode = false;
    const maxGlobalSteps = 150;
    const controlKey = `rpa:run:${runId}:control`;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Espera bloqueante hasta resume / step / stop. Devuelve "stop" o "continue".
    const waitForResume = async (): Promise<"continue" | "stop"> => {
      await this.eventEmitter.emitRunPaused(runId);
      await this.eventEmitter.emitRunLog(
        runId,
        "warn",
        "Ejecución pausada. Esperando reanudación...",
        activeNodeId,
        "runner"
      );

      while (true) {
        await sleep(600);
        const control = await this.redis?.get(controlKey);

        if (control === "resume") {
          await this.redis?.del(controlKey);
          await this.eventEmitter.emitRunResumed(runId);
          await this.eventEmitter.emitRunLog(runId, "info", "Ejecución reanudada.", activeNodeId, "runner");
          return "continue";
        }

        if (control === "step") {
          await this.redis?.del(controlKey);
          stepMode = true;
          await this.eventEmitter.emitRunResumed(runId);
          await this.eventEmitter.emitRunLog(
            runId,
            "info",
            "Avanzando un paso y volviendo a pausar.",
            activeNodeId,
            "runner"
          );
          return "continue";
        }

        if (control === "stop") {
          await this.redis?.del(controlKey);
          await this.eventEmitter.emitRunStopped(runId);
          await this.eventEmitter.emitRunLog(
            runId,
            "warn",
            "Ejecución detenida por solicitud del usuario.",
            activeNodeId,
            "runner"
          );
          return "stop";
        }
      }
    };

    // Función auxiliar para revisar pausa / cancelación / paso a paso
    const checkControl = async (): Promise<"continue" | "stop"> => {
      if (!this.redis) {
        return "continue";
      }

      const control = await this.redis.get(controlKey);

      if (control === "stop") {
        await this.redis.del(controlKey);
        await this.eventEmitter.emitRunStopped(runId);
        await this.eventEmitter.emitRunLog(
          runId,
          "warn",
          "Ejecución detenida por solicitud del usuario.",
          activeNodeId,
          "runner"
        );
        return "stop";
      }

      if (control === "pause") {
        await this.redis.del(controlKey);
        return waitForResume();
      }

      if (control === "step") {
        await this.redis.del(controlKey);
        stepMode = true;
      }

      return "continue";
    };

    type ChainOutcome =
      | { kind: "next"; nodeId?: string }
      | { kind: "stop" }
      | { kind: "error"; nodeId: string; error: unknown };

    const executeNodeWithRetry = async (node: RecipeNode): Promise<ActionResult> => {
      const policy = resolveRetryPolicy(node);
      const maxAttempts = node.onError === "retry" ? policy.maxAttempts : 1;
      let attempt = 0;

      for (;;) {
        attempt++;

        try {
          return await executeNodeAction(page, node, execContext);
        } catch (attemptError: unknown) {
          if (attemptError instanceof ExecutionStoppedError) {
            throw attemptError;
          }

          if (attempt >= maxAttempts) {
            throw attemptError;
          }

          const waitMs = retryDelayMs(policy, attempt);
          const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError);

          await this.eventEmitter.emitRunLog(
            runId,
            "warn",
            `Paso [${node.id}] falló en el intento ${attempt}/${maxAttempts}: ${errorMsg}. Reintentando en ${waitMs}ms`,
            node.id,
            "runner",
            {
              attempt,
              maxAttempts,
              delay_ms: waitMs,
              error: errorMsg,
              backoff: policy.backoff,
            }
          );

          const controlBeforeWait = await checkControl();
          if (controlBeforeWait === "stop") {
            throw new ExecutionStoppedError();
          }

          if (waitMs > 0) {
            await sleep(waitMs);
          }

          const controlAfterWait = await checkControl();
          if (controlAfterWait === "stop") {
            throw new ExecutionStoppedError();
          }
        }
      }
    };

    const executeNodeStep = async (node: RecipeNode): Promise<ChainOutcome> => {
      activeNodeId = node.id;
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
        const result = await executeNodeWithRetry(node);
        const stepDurationMs = Date.now() - stepStartTime;

        // Guardar salida de paso en el contexto de variables y pasos
        if (result.output !== undefined) {
          execContext.stepResults[node.id] = result.output;
          execContext.variables[`steps.${node.id}.output`] = result.output;
          if (!execContext.variables.steps || typeof execContext.variables.steps !== "object") {
            execContext.variables.steps = {};
          }
          (execContext.variables.steps as Record<string, unknown>)[node.id] = { output: result.output };
        }

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
            output: result.output,
          }
        );

        visitedNodes.add(node.id);
        return { kind: "next", nodeId: result.nextNodeId };
      } catch (nodeError: unknown) {
        if (nodeError instanceof ExecutionStoppedError) {
          return { kind: "stop" };
        }

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
          return { kind: "next", nodeId: node.next };
        }

        return { kind: "error", nodeId: node.id, error: nodeError };
      }
    };

    const executeTryCatch = async (node: TryCatchNode): Promise<ChainOutcome> => {
      activeNodeId = node.id;
      const stepStartTime = Date.now();
      const errorVariable = node.params.errorVariable || "error";

      const logPhase = async (
        phase: "try" | "catch" | "finally",
        level: "info" | "warn" | "error" | "success",
        message: string
      ): Promise<void> => {
        await this.eventEmitter.emitRunLog(runId, level, message, node.id, "runner", {
          scope: "tryCatch",
          phase,
        });
      };

      await this.eventEmitter.emitStepStarted(runId, node.id);
      await this.eventEmitter.emitRunLog(
        runId,
        "info",
        `Paso [${node.id}] (tryCatch): ${node.description || "Bloque protegido"}`,
        node.id,
        "runner"
      );
      await logPhase("try", "info", "Entrando en bloque try");

      let caught = false;
      let caughtError: Record<string, unknown> | null = null;
      let propagated: ChainOutcome = { kind: "next", nodeId: node.next };

      const tryOutcome = await runChain(node.params.tryEntryNodeId, node.next);

      if (tryOutcome.kind === "stop") {
        return tryOutcome;
      }

      if (tryOutcome.kind === "error") {
        caught = true;
        const error = tryOutcome.error;
        const message = error instanceof Error ? error.message : String(error);
        caughtError = {
          message,
          nodeId: tryOutcome.nodeId,
          type: error instanceof Error ? error.name : "Error",
        };
        execContext.variables[errorVariable] = caughtError;

        await logPhase(
          "catch",
          "warn",
          `Error capturado en [${tryOutcome.nodeId}]: ${message}`
        );

        const catchOutcome = await runChain(node.params.catchEntryNodeId, node.next);

        if (catchOutcome.kind === "stop") {
          return catchOutcome;
        }

        if (catchOutcome.kind === "error") {
          // Un fallo dentro del catch se propaga después de ejecutar finally.
          propagated = catchOutcome;
        } else if (node.params.rethrow) {
          propagated = tryOutcome;
        }
      }

      if (node.params.finallyEntryNodeId) {
        await logPhase("finally", "info", "Ejecutando bloque finally");
        const finallyOutcome = await runChain(node.params.finallyEntryNodeId, node.next);

        if (finallyOutcome.kind === "stop") {
          return finallyOutcome;
        }

        if (finallyOutcome.kind === "error") {
          propagated = finallyOutcome;
        }
      }

      execContext.stepResults[node.id] = { caught, error: caughtError };
      execContext.variables[`steps.${node.id}.output`] = { caught, error: caughtError };

      const stepDurationMs = Date.now() - stepStartTime;
      await this.eventEmitter.emitStepFinished(runId, node.id, stepDurationMs);
      await logPhase(
        "try",
        "success",
        caught
          ? `Bloque tryCatch completado: error capturado y manejado (${stepDurationMs}ms)`
          : `Bloque tryCatch completado sin errores (${stepDurationMs}ms)`
      );

      return propagated;
    };

    const runChain = async (startId?: string, stopAt?: string): Promise<ChainOutcome> => {
      let currentNodeId = startId;

      while (currentNodeId && currentNodeId !== stopAt && stepCount < maxGlobalSteps) {
        // Si venimos de un "step", ejecutamos un nodo y volvemos a pausar.
        if (stepMode) {
          stepMode = false;
          const pausedCtrl = await waitForResume();
          if (pausedCtrl === "stop") {
            return { kind: "stop" };
          }
        }

        // Verificar control de usuario antes de cada paso
        const ctrl = await checkControl();
        if (ctrl === "stop") {
          return { kind: "stop" };
        }

        stepCount++;
        const node: RecipeNode | undefined = recipe.nodes[currentNodeId];
        if (!node) {
          return {
            kind: "error",
            nodeId: currentNodeId,
            error: new Error(`Nodo '${currentNodeId}' no encontrado en el grafo`),
          };
        }

        if (node.type === "tryCatch") {
          const outcome = await executeTryCatch(node);
          if (outcome.kind !== "next") {
            return outcome;
          }
          currentNodeId = outcome.nodeId;
          continue;
        }

        const outcome = await executeNodeStep(node);
        if (outcome.kind !== "next") {
          return outcome;
        }
        currentNodeId = outcome.nodeId;
      }

      return { kind: "next", nodeId: currentNodeId };
    };

    try {
      const outcome = await runChain(recipe.entry);

      if (outcome.kind === "stop") {
        throw new ExecutionStoppedError();
      }

      if (outcome.kind === "error") {
        throw outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error));
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
