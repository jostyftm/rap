import { Redis, type RedisOptions } from "ioredis";

export interface RedisConnectionTarget {
  url?: string;
  options: RedisOptions;
}

const DEFAULT_RETRY_STRATEGY = (times: number): number => Math.min(times * 500, 2000);

function hasExplicitDbPath(parsed: URL): boolean {
  const trimmed = parsed.pathname.replace(/^\/+/, "");
  return trimmed.length > 0 && /^\d+$/.test(trimmed);
}

/**
 * Construye los parámetros de conexión para ioredis soportando `REDIS_URL`
 * (`redis://`, `rediss://`, usuario, contraseña y DB `/N`) o `REDIS_HOST` /
 * `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` por separado.
 */
export function buildRedisConnectionTarget(
  env: NodeJS.ProcessEnv = process.env
): RedisConnectionTarget {
  const rawUrl = env.REDIS_URL?.trim();

  if (rawUrl) {
    const options: RedisOptions = {
      retryStrategy: DEFAULT_RETRY_STRATEGY,
    };

    try {
      const parsed = new URL(rawUrl);
      if (!hasExplicitDbPath(parsed) && env.REDIS_DB !== undefined && env.REDIS_DB !== "") {
        const db = Number(env.REDIS_DB);
        if (Number.isInteger(db) && db >= 0) {
          options.db = db;
        }
      }
    } catch {
      // Si el formato no es URL estándar, ioredis validará al conectar.
    }

    return { url: rawUrl, options };
  }

  const db = env.REDIS_DB !== undefined && env.REDIS_DB !== "" ? Number(env.REDIS_DB) : 0;

  return {
    options: {
      host: env.REDIS_HOST || "localhost",
      port: Number(env.REDIS_PORT || 6379),
      username: env.REDIS_USERNAME || undefined,
      password: env.REDIS_PASSWORD ?? "secret_password",
      db: Number.isInteger(db) && db >= 0 ? db : 0,
      retryStrategy: DEFAULT_RETRY_STRATEGY,
    },
  };
}

/**
 * Crea la instancia ioredis a partir de las variables de entorno actuales.
 */
export function createRedisClient(env: NodeJS.ProcessEnv = process.env): Redis {
  const target = buildRedisConnectionTarget(env);
  if (target.url) {
    return new Redis(target.url, target.options);
  }
  return new Redis(target.options);
}

/**
 * Devuelve una representación segura de la conexión Redis sin exponer credenciales en logs.
 */
export function maskRedisUrlForLogs(env: NodeJS.ProcessEnv = process.env): string {
  const rawUrl = env.REDIS_URL?.trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.password) {
        parsed.password = "***";
      }
      if (!hasExplicitDbPath(parsed) && env.REDIS_DB !== undefined && env.REDIS_DB !== "") {
        parsed.pathname = `/${env.REDIS_DB}`;
      }
      return parsed.toString();
    } catch {
      return rawUrl.replace(/:([^:@/]+)@/, ":***@");
    }
  }

  const host = env.REDIS_HOST || "localhost";
  const port = env.REDIS_PORT || "6379";
  const db = env.REDIS_DB !== undefined && env.REDIS_DB !== "" ? env.REDIS_DB : "0";
  return `${host}:${port}/${db}`;
}
