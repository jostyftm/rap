import { Redis } from "ioredis";
import { RedisEventEmitter } from "./protocol/event-emitter.js";
import { RedisStreamConsumer } from "./protocol/stream-consumer.js";
import { ensureBucket } from "./storage/s3.js";
import { LiveServer } from "./live/live-server.js";
import { ExternalBrowserManager } from "./live/external-browser.js";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || "secret_password";

console.log("[RPA-Runner] Iniciando servicio de automatización Playwright...");
console.log(`[RPA-Runner] Conectando a Redis en ${REDIS_HOST}:${REDIS_PORT}...`);

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  retryStrategy(times: number) {
    const delay = Math.min(times * 500, 2000);
    return delay;
  },
});

const eventEmitter = new RedisEventEmitter(redis, process.env.EVENT_STREAM || "rpa:evt");
const streamConsumer = new RedisStreamConsumer(
  redis,
  eventEmitter,
  process.env.COMMAND_STREAM || "rpa:cmd",
  "rpa:runners"
);

const externalBrowser = new ExternalBrowserManager(eventEmitter);
const liveServer = new LiveServer(
  Number(process.env.RUNNER_LIVE_PORT || 8085),
  process.env.RUNNER_LIVE_TOKEN || "local-live-token",
  externalBrowser
);
liveServer.start();


redis.on("connect", () => {
  console.log("[RPA-Runner] Conexión establecida con Redis.");
  ensureBucket().catch((err) => {
    console.warn("[RPA-Runner] Aviso inicializando bucket S3:", err.message);
  });
  registerHeartbeat();
  streamConsumer.start().catch((err) => {
    console.error("[RPA-Runner] Error fatal en stream consumer:", err);
  });
});

redis.on("error", (err: Error) => {
  console.error("[RPA-Runner] Error en conexión Redis:", err.message);
});

function registerHeartbeat(): void {
  const runnerId = `runner-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  setInterval(async () => {
    try {
      await redis.set(`rpa:runner:${runnerId}:heartbeat`, Date.now().toString(), "EX", 15);
    } catch {
      // Ignorar fallos transitorios en heartbeat
    }
  }, 5000);
  console.log(`[RPA-Runner] Heartbeat registrado como ${runnerId}`);
}

process.on("SIGTERM", async () => {
  console.log("[RPA-Runner] Señal SIGTERM recibida, cerrando limpiamente...");
  streamConsumer.stop();
  await externalBrowser.closeAll();
  await liveServer.close();
  await redis.quit();
  process.exit(0);
});
