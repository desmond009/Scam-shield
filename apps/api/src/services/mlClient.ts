import { FEATURE_NAMES, type Features } from "@scamshield/shared";
import { config } from "../config";
import { keys, TTL } from "../lib/keys";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import { recordMlCall } from "./metrics";

export interface MlScore {
  score: number;
  probability: number;
  modelVersion: string;
  topFeatures: { feature: string; value: number; contribution: number }[];
  latencyMs: number;
}

const FAILURE_THRESHOLD = 5;

/**
 * Circuit breaker shared by all API instances through Redis:
 *  closed    -> calls go through; failures are counted in a 30 s window
 *  open      -> after 5 failures, skip the ML call for 15 s (rules only, decision marked degraded)
 *  half-open -> once the open period expires, a single request (probe lock) tries ML again;
 *               success closes the breaker, failure re-opens it for another 15 s
 */
export async function breakerState(): Promise<"closed" | "open" | "half-open"> {
  const [open, tripped] = await Promise.all([redis.exists(keys.breakerOpen), redis.exists(keys.breakerTripped)]);
  if (open) return "open";
  return tripped ? "half-open" : "closed";
}

async function trip() {
  await redis
    .multi()
    .set(keys.breakerOpen, "1", "EX", TTL.breakerOpenSeconds)
    .set(keys.breakerTripped, "1", "EX", TTL.breakerTrippedSeconds)
    .del(keys.breakerFailures, keys.breakerProbe)
    .exec();
  logger.warn("ML circuit breaker opened; scoring falls back to rules only");
}

async function onFailure(state: "closed" | "half-open") {
  if (state === "half-open") return trip();
  const failures = await redis.incr(keys.breakerFailures);
  if (failures === 1) await redis.expire(keys.breakerFailures, TTL.breakerFailureWindowSeconds);
  if (failures >= FAILURE_THRESHOLD) await trip();
}

async function onSuccess(state: "closed" | "half-open") {
  if (state === "half-open") {
    await redis.del(keys.breakerTripped, keys.breakerProbe, keys.breakerFailures);
    logger.info("ML circuit breaker closed");
  }
}

async function callMl(features: Features): Promise<MlScore> {
  const res = await fetch(`${config.ML_URL}/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ features: Object.fromEntries(FEATURE_NAMES.map((n) => [n, features[n]])) }),
    signal: AbortSignal.timeout(config.ML_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ML responded ${res.status}`);
  return (await res.json()) as MlScore;
}

/** Opens the keep-alive connection to the ML service at startup so the first payment is not slowed down. */
export async function warmUpMl(): Promise<void> {
  try {
    await fetch(`${config.ML_URL}/health`, { signal: AbortSignal.timeout(2_000) });
  } catch {
    logger.warn("ML service not reachable at startup; decisions will use rules only until it is");
  }
}

/** Returns null when the ML service is slow, down or the breaker is open; the caller then uses rules only. */
export async function scoreWithMl(features: Features): Promise<MlScore | null> {
  let state: "closed" | "open" | "half-open" = "closed";
  try {
    state = await breakerState();
    if (state === "half-open") {
      const probe = await redis.set(keys.breakerProbe, "1", "EX", 5, "NX");
      if (!probe) state = "open";
    }
    if (state === "open") {
      recordMlCall("breaker_open");
      return null;
    }
    const result = await callMl(features);
    await onSuccess(state);
    recordMlCall("ok");
    return result;
  } catch (err) {
    const timeout = (err as Error).name === "TimeoutError";
    recordMlCall(timeout ? "timeout" : "error");
    logger.warn({ err: (err as Error).message }, "ML scoring failed; using rules only");
    if (state !== "open") await onFailure(state).catch(() => undefined);
    return null;
  }
}
