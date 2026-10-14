import type { Request, Response } from "express";
import type Redis from "ioredis";
import { keys } from "../lib/keys";
import { logger } from "../lib/logger";
import { newRedisConnection, redis } from "../lib/redis";

export interface LiveEvent {
  type: "alert" | "alert-reviewed";
  [key: string]: unknown;
}

const clients = new Set<Response>();
let subscriber: Redis | null = null;

/** Workers publish through Redis pub/sub so every API instance can fan events out to its own SSE clients. */
export function publishEvent(event: LiveEvent): Promise<number> {
  return redis.publish(keys.eventsChannel, JSON.stringify(event));
}

function ensureSubscribed() {
  if (subscriber) return;
  subscriber = newRedisConnection();
  subscriber.subscribe(keys.eventsChannel).catch((err) => logger.error({ err }, "SSE subscribe failed"));
  subscriber.on("message", (_channel, message) => {
    for (const res of clients) res.write(`event: message\ndata: ${message}\n\n`);
  });
}

export function openEventStream(req: Request, res: Response) {
  ensureSubscribed();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);
  res.write(`event: message\ndata: ${JSON.stringify({ type: "connected" })}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export const sseClientCount = () => clients.size;
