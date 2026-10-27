import "server-only";
import Redis from "ioredis";
import { getEnv } from "@/config/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

// Conexão preguiçosa: o build e as telas que não usam sessão não abrem socket.
export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(getEnv().REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    globalForRedis.redis.on("error", (err) => console.error("[redis]", err.message));
  }
  return globalForRedis.redis;
}
