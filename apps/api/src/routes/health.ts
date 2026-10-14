import { Router } from "express";
import { prisma } from "../lib/db";
import { redis } from "../lib/redis";

export const healthRouter = Router();

/** Liveness: the process is up. */
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api", uptimeSeconds: Math.round(process.uptime()) });
});

/** Readiness: dependencies the API cannot work without are reachable. The ML service is optional (rules fallback). */
healthRouter.get("/ready", async (_req, res) => {
  const checks = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const [db, cache] = checks.map((c) => c.status === "fulfilled");
  const ready = db && cache;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", postgres: db, redis: cache });
});
