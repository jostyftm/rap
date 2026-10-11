import type { Redis } from "ioredis";
import type { RecipeDsl } from "@rpa/dsl";
import { RecipeExecutor } from "../engine/executor.js";
import { RecorderEngine } from "../recorder/recorder-engine.js";
import type { RedisEventEmitter } from "./event-emitter.js";

export class RedisStreamConsumer {
  private isRunning = false;

  constructor(
    private redis: Redis,
    private eventEmitter: RedisEventEmitter,
    private streamName = "rpa:cmd",
    private groupName = "rpa:runners",
    private consumerName = `runner-${process.pid}`
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    await this.ensureGroupExists();
    console.log(`[StreamConsumer] Escuchando comandos en '${this.streamName}' como '${this.consumerName}'...`);

    const executor = new RecipeExecutor(this.eventEmitter, this.redis);
    const recorder = new RecorderEngine(this.eventEmitter);

    while (this.isRunning) {
      try {
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
          const [stream, messages] = results[0] as [string, [string, string[]][]];
          for (const [messageId, fields] of messages) {
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }

            console.log(`[StreamConsumer] Comando recibido: ${data.command} (id: ${data.id || messageId})`);

            if (data.command === "run.start" && data.definition) {
              try {
                const recipe = JSON.parse(data.definition) as RecipeDsl;
                const parameters = data.parameters ? JSON.parse(data.parameters) : {};
                const secrets = data.secrets ? JSON.parse(data.secrets) : {};
                const options = data.options ? JSON.parse(data.options) : {};

                await executor.execute({
                  runId: data.run_id,
                  recipe,
                  parameters,
                  secrets,
                  options,
                });
              } catch (execErr) {
                console.error("[StreamConsumer] Error ejecutando receta:", execErr);
              }
            } else if (data.command === "recorder.start" && data.initial_url) {
              try {
                await recorder.start({
                  sessionId: data.session_id,
                  recipeId: data.recipe_id,
                  initialUrl: data.initial_url,
                });
              } catch (recErr) {
                console.error("[StreamConsumer] Error iniciando grabación:", recErr);
              }
            } else if (data.command === "recorder.stop" && data.session_id) {
              try {
                await recorder.stop(data.session_id);
              } catch (recStopErr) {
                console.error("[StreamConsumer] Error deteniendo grabación:", recStopErr);
              }
            }

            // Confirmar procesamiento del comando
            await this.redis.xack(this.streamName, this.groupName, messageId);
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
  }

  stop(): void {
    this.isRunning = false;
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
