import { Redis } from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

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

redis.on("connect", () => {
  console.log("[RPA-Runner] Conexión establecida con Redis.");
  registerHeartbeat();
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
  await redis.quit();
  process.exit(0);
});
