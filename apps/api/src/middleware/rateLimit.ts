import type { Request } from "express";
import { rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { config } from "../config";
import { keys } from "../lib/keys";
import { redis } from "../lib/redis";

const store = (prefix: string) =>
  new RedisStore({
    prefix: `${keys.rateLimit}${prefix}:`,
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
  });

const message = (what: string) => ({ error: { code: "RATE_LIMITED", message: `Too many ${what}. Please wait a minute.` } });

export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_AUTH_PER_MIN,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: store("auth"),
  message: message("sign-in attempts"),
});

export const checkLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_CHECK_PER_MIN,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: store("check"),
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "anon",
  message: message("payment checks"),
});
