import type { Redis } from "ioredis";
import type { RecipeDsl } from "@rpa/dsl";
import { RecipeExecutor } from "../engine/executor.js";
import { RecorderEngine } from "../recorder/recorder-engine.js";
import { SecretClient } from "../secrets/secret-client.js";
import type { RedisEventEmitter } from "./event-emitter.js";

const COMMAND_TTL_SECONDS = 86400;
const RECLAIM_AFTER_MS = 60000;
const RECLAIM_EVERY_LOOPS = 15;

export class RedisStreamConsumer {
  private isRunning = false;

  private loops = 0;

  constructor(
    private redis: Redis,
    private eventEmitter: RedisEventEmitter,
    private streamName = "rpa:cmd",
    private groupName = "rpa:runners",
    private consumerName = `runner-${process.pid}`,
    private secretClient = new SecretClient()
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    await this.ensureGroupExists();
    console.log(`[StreamConsumer] Escuchando comandos en '${this.streamName}' como '${this.consumerName}'...`);

    const executor = new RecipeExecutor(this.eventEmitter, this.redis);
    const recorder = new RecorderEngine(this.eventEmitter);

    while (this.isRunning) {
      try {
        if (this.loops % RECLAIM_EVERY_LOOPS === 0) {
          await this.reclaimPending(executor, recorder);
        }
        this.loops++;

        // Bloquea por 2 segundos esperando nuevos mensajes
        const results = (await (this.redis as any).xreadgroup(
          "GROUP",
          this.groupName,
          this.consumerName,
          "COUNT",
          1,
          "BLOCK",
          2000,
          "STREAMS",
          this.streamName,
          ">"
        )) as [string, [string, string[]][]][] | null;

        if (results && results.length > 0) {
          const [, messages] = results[0] as [string, [string, string[]][]];
          for (const [messageId, fields] of messages) {
            await this.handleMessage(messageId, fields, executor, recorder);
          }
        }
      } catch (err: unknown) {
        if (!this.isRunning) break;
        console.error("[StreamConsumer] Error en bucle de streams:", err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    await recorder.closeAll();
    await executor.close();
    this.secretClient.clearAll();
  }

  stop(): void {
    this.isRunning = false;
  }

  private async handleMessage(
    messageId: string,
    fields: string[],
    executor: RecipeExecutor,
    recorder: RecorderEngine
  ): Promise<void> {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }

    const commandId = data.id || messageId;
    const dedupeKey = `rpa:cmd:processed:${commandId}`;

    try {
      if ((await this.redis.exists(dedupeKey)) === 1) {
        console.warn(`[StreamConsumer] Comando duplicado ignorado: ${commandId}`);
        return;
      }

      console.log(`[StreamConsumer] Comando recibido: ${data.command} (id: ${commandId})`);

      await this.dispatch(data, executor, recorder);
      await this.redis.set(dedupeKey, "1", "EX", COMMAND_TTL_SECONDS);
    } catch (err) {
      console.error(`[StreamConsumer] Error procesando comando ${commandId}:`, err);
    } finally {
      // Confirmar siempre: un comando inválido no debe bloquear el grupo.
      await this.redis.xack(this.streamName, this.groupName, messageId);
    }
  }

  private async dispatch(
    data: Record<string, string>,
    executor: RecipeExecutor,
    recorder: RecorderEngine
  ): Promise<void> {
    switch (data.command) {
      case "run.start":
        await this.handleRunStart(data, executor);
        break;
      case "run.pause":
        await this.setControl(data.run_id, "pause");
        break;
      case "run.resume":
        await this.setControl(data.run_id, "resume");
        break;
      case "run.stop":
        await this.setControl(data.run_id, "stop");
        break;
      case "run.step":
        await this.setControl(data.run_id, "step");
        break;
      case "recorder.start": {
        const typeDebounceMs = data.type_debounce_ms ? Number(data.type_debounce_ms) : 1000;
        const captureScroll = data.capture_scroll !== "false";

        if (data.initial_url) {
          await recorder.start({
            sessionId: data.session_id,
            recipeId: data.recipe_id,
            initialUrl: data.initial_url,
            typeDebounceMs,
            captureScroll,
          });
        }
        break;
      }
      case "recorder.stop":
        if (data.session_id) {
          await recorder.stop(data.session_id);
        }
        break;
      default:
        console.warn(`[StreamConsumer] Comando desconocido: ${data.command}`);
    }
  }

  private async handleRunStart(data: Record<string, string>, executor: RecipeExecutor): Promise<void> {
    if (!data.definition || !data.run_id) {
      throw new Error("run.start sin definition o run_id");
    }

    const runId = data.run_id;
    const startedKey = `rpa:run:${runId}:started`;

    const recipe = JSON.parse(data.definition) as RecipeDsl;
    const parameters = data.parameters ? JSON.parse(data.parameters) : {};
    const options = data.options ? JSON.parse(data.options) : {};
    const secretRefs = this.parseSecretRefs(data.secret_refs);
    const trigger = data.trigger || "manual";
    const recipeId = data.recipe_id || undefined;
    const webhookTriggerUrl = data.webhook_trigger_url || null;
    const webhookEnabled = data.webhook_enabled === "1";

    let secrets: Record<string, string> = {};

    try {
      secrets = await this.secretClient.fetchSecrets(runId, secretRefs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.eventEmitter.emitRunLog(
        runId,
        "error",
        `No se pudieron resolver los secretos de la ejecución: ${message}`,
        undefined,
        "runner"
      );
      await this.eventEmitter.emitRunFinished(runId, "failed", 0, message);
      return;
    }

    // Evita ejecutar dos veces la misma ejecución si el mensaje se reentrega.
    const acquired = await this.redis.set(startedKey, "1", "EX", 3600, "NX");
    if (acquired === null) {
      console.warn(`[StreamConsumer] run.start duplicado ignorado para ${runId}`);
      return;
    }

    if (secretRefs.length > 0) {
      this.eventEmitter.registerRunSecrets(runId, secrets);
    }

    try {
      await executor.execute({
        runId,
        recipe,
        parameters,
        secrets,
        options,
        trigger,
        recipeId,
        webhookTriggerUrl,
        webhookEnabled,
      });
    } catch (err) {
      // Errores fuera del bucle del executor (p. ej. lanzar Chromium).
      const message = err instanceof Error ? err.message : String(err);
      await this.eventEmitter.emitRunLog(
        runId,
        "error",
        `La ejecución no pudo iniciarse: ${message}`,
        undefined,
        "runner"
      );
      await this.eventEmitter.emitRunFinished(runId, "failed", 0, message);
    } finally {
      this.eventEmitter.clearRunSecrets(runId);
      this.secretClient.clear(runId);
    }
  }

  private async setControl(runId: string | undefined, action: string): Promise<void> {
    if (!runId) {
      throw new Error(`Comando de control sin run_id (${action})`);
    }

    await this.redis.setex(`rpa:run:${runId}:control`, 3600, action);
  }

  private parseSecretRefs(raw: string | undefined): string[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
    } catch {
      console.warn("[StreamConsumer] secret_refs inválido, se ignorará");
      return [];
    }
  }

  private async reclaimPending(
    executor: RecipeExecutor,
    recorder: RecorderEngine
  ): Promise<void> {
    let cursor = "0-0";

    do {
      const result = (await (this.redis as any).xautoclaim(
        this.streamName,
        this.groupName,
        this.consumerName,
        RECLAIM_AFTER_MS,
        cursor,
        "COUNT",
        10
      )) as [string, [string, string[]][], string[]?] | null;

      if (!result || !Array.isArray(result)) {
        return;
      }

      cursor = typeof result[0] === "string" ? result[0] : "0-0";
      const messages = Array.isArray(result[1]) ? result[1] : [];

      for (const [messageId, fields] of messages) {
        await this.handleMessage(messageId, fields, executor, recorder);
      }
    } while (cursor !== "0-0" && this.isRunning);
  }

  private async ensureGroupExists(): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", this.streamName, this.groupName, "$", "MKSTREAM");
      console.log(`[StreamConsumer] Consumer group '${this.groupName}' creado.`);
    } catch (err: any) {
      if (err.message?.includes("BUSYGROUP")) {
        // Grupo ya existía, normal
      } else {
        console.warn("[StreamConsumer] Aviso creando grupo:", err.message);
      }
    }
  }
}
