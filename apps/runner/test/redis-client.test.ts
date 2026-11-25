import { describe, it, expect } from "vitest";
import {
  buildRedisConnectionTarget,
  maskRedisUrlForLogs,
} from "../src/protocol/redis-client.js";

describe("redis-client", () => {
  it("prioriza REDIS_URL con usuario, contraseña y base de datos en el path", () => {
    const target = buildRedisConnectionTarget({
      REDIS_URL: "rediss://default:supersecret@redis.internal:6380/2",
      REDIS_HOST: "ignored-host",
      REDIS_PORT: "6379",
      REDIS_DB: "5",
    } as NodeJS.ProcessEnv);

    expect(target.url).toBe("rediss://default:supersecret@redis.internal:6380/2");
    expect(target.options.db).toBeUndefined();
    expect(target.options.retryStrategy?.(1)).toBe(500);
    expect(target.options.retryStrategy?.(10)).toBe(2000);
  });

  it("aplica REDIS_DB como fallback cuando REDIS_URL no especifica /db", () => {
    const target = buildRedisConnectionTarget({
      REDIS_URL: "redis://:secret@redis.dokploy:6379",
      REDIS_DB: "3",
    } as NodeJS.ProcessEnv);

    expect(target.url).toBe("redis://:secret@redis.dokploy:6379");
    expect(target.options.db).toBe(3);
  });

  it("usa REDIS_HOST, REDIS_PORT, REDIS_PASSWORD y REDIS_DB si no hay REDIS_URL", () => {
    const target = buildRedisConnectionTarget({
      REDIS_HOST: "cache.internal",
      REDIS_PORT: "6381",
      REDIS_USERNAME: "rpa",
      REDIS_PASSWORD: "",
      REDIS_DB: "4",
    } as NodeJS.ProcessEnv);

    expect(target.url).toBeUndefined();
    expect(target.options).toMatchObject({
      host: "cache.internal",
      port: 6381,
      username: "rpa",
      password: "",
      db: 4,
    });
  });

  it("oculta la contraseña en maskRedisUrlForLogs", () => {
    const masked = maskRedisUrlForLogs({
      REDIS_URL: "redis://rpa:TopSecret123@redis.internal:6379",
      REDIS_DB: "2",
    } as NodeJS.ProcessEnv);

    expect(masked).not.toContain("TopSecret123");
    expect(masked).toContain("***");
    expect(masked).toContain("/2");
  });
});
