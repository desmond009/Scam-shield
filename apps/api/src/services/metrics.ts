import type { Band } from "@scamshield/shared";
import { keys } from "../lib/keys";
import { redis } from "../lib/redis";

export const LATENCY_BUCKETS_MS = [10, 25, 50, 100, 150, 200, 300, 500, 1000] as const;
const SAMPLE_SIZE = 2000;

function bucketFor(ms: number): string {
  const b = LATENCY_BUCKETS_MS.find((limit) => ms <= limit);
  return b === undefined ? "+Inf" : String(b);
}

/** Fire-and-forget counters for the System Health page; failures here must never break a payment. */
export function recordDecisionMetrics(band: Band, latencyMs: number) {
  redis
    .multi()
    .hincrby(keys.metricsDecisions, band, 1)
    .hincrby(keys.metricsLatency, bucketFor(latencyMs), 1)
    .lpush(keys.metricsLatencySamples, latencyMs.toFixed(2))
    .ltrim(keys.metricsLatencySamples, 0, SAMPLE_SIZE - 1)
    .exec()
    .catch(() => undefined);
}

export type MlOutcome = "ok" | "timeout" | "error" | "breaker_open";

export function recordMlCall(outcome: MlOutcome) {
  const m = redis.multi().hincrby(keys.metricsMl, "calls", 1).hincrby(keys.metricsMl, outcome, 1);
  if (outcome !== "ok") m.hincrby(keys.metricsMl, "fallbacks", 1);
  m.exec().catch(() => undefined);
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
