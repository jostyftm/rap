import os from "node:os";
import { RedisEventEmitter } from "./protocol/event-emitter.js";
import { createRedisClient, maskRedisUrlForLogs } from "./protocol/redis-client.js";
import { RedisStreamConsumer } from "./protocol/stream-consumer.js";
import { ensureBucket } from "./storage/s3.js";
import { LiveServer } from "./live/live-server.js";
import { ExternalBrowserManager } from "./live/external-browser.js";
import { ScreencastManager } from "./live/screencast-manager.js";

const concurrency = Math.max(
  1,
  Math.min(20, Math.floor(Number(process.env.RUNNER_CONCURRENCY) || 2))
);
const idleBrowserCloseMs = Math.max(
  0,
  Number(process.env.RUNNER_LIVE_IDLE_CLOSE_MS ?? 60_000)
);

console.log(
  `[RPA-Runner] Iniciando servicio Playwright (concurrencia: ${concurrency})...`
);
console.log(`[RPA-Runner] Conectando a Redis en ${maskRedisUrlForLogs(process.env)}...`);

const redis = createRedisClient(process.env);
const consumerName = `runner-${os.hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;

const eventEmitter = new RedisEventEmitter(redis, process.env.EVENT_STREAM || "rpa:evt");
const streamConsumer = new RedisStreamConsumer(
  redis,
  eventEmitter,
  process.env.COMMAND_STREAM || "rpa:cmd",
  "rpa:runners",
  consumerName,
  undefined,
  concurrency
);

const externalBrowser = new ExternalBrowserManager(eventEmitter);
const screencastManager = new ScreencastManager({ idleBrowserCloseMs });
const liveServer = new LiveServer(
  Number(process.env.RUNNER_LIVE_PORT || 8085),
  process.env.RUNNER_LIVE_TOKEN || "local-live-token",
  externalBrowser,
  screencastManager
);
liveServer.start();

let started = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

redis.on("connect", () => {
  console.log("[RPA-Runner] Conexión establecida con Redis.");
  if (started) {
    return;
  }
  started = true;

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
  const runnerId = consumerName;
  heartbeatTimer = setInterval(async () => {
    try {
      await redis.set(`rpa:runner:${runnerId}:heartbeat`, Date.now().toString(), "EX", 15);
    } catch {
      // Ignorar fallos transitorios en heartbeat
    }
  }, 5000);
  heartbeatTimer.unref();
  console.log(`[RPA-Runner] Heartbeat registrado como ${runnerId}`);
}

process.on("SIGTERM", async () => {
  console.log("[RPA-Runner] Señal SIGTERM recibida, cerrando limpiamente...");
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  streamConsumer.stop();
  await screencastManager.closeAll();
  await externalBrowser.closeAll();
  await liveServer.close();
  await redis.quit();
  process.exit(0);
});
