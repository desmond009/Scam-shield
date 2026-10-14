import Redis from "ioredis";
import { config } from "../config";

/** Shared command connection. BullMQ and pub/sub create their own connections. */
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, enableAutoPipelining: true });

export function newRedisConnection(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}
