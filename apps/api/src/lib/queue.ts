import { Queue } from "bullmq";
import { logger } from "./logger";
import { newRedisConnection } from "./redis";

/** Fast, frequent jobs: alerts, live events, baselines, reputation, metrics. */
export const RISK_QUEUE = "risk-events";
/** Slow, rare jobs: retraining and model registry sync. */
export const MODEL_QUEUE = "model";

export type RiskJob =
  | { name: "decision"; data: { decisionId: string } }
  | { name: "payment-completed"; data: { transactionId: string; userId: string; payeeUpiId: string } }
  | { name: "payee-updated"; data: { payeeUpiId: string } }
  | { name: "metrics-aggregate"; data: Record<string, never> };

let riskQueue: Queue | null = null;
let modelQueue: Queue | null = null;

export function getRiskQueue(): Queue {
  riskQueue ??= new Queue(RISK_QUEUE, {
    connection: newRedisConnection(),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 500 }, removeOnComplete: 500, removeOnFail: 500 },
  });
  return riskQueue;
}

export function getModelQueue(): Queue {
  modelQueue ??= new Queue(MODEL_QUEUE, {
    connection: newRedisConnection(),
    defaultJobOptions: { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
  });
  return modelQueue;
}

/** Enqueue off the hot path. A queue outage must not fail a payment, so errors are logged, not thrown. */
export async function enqueue(job: RiskJob): Promise<void> {
  try {
    await getRiskQueue().add(job.name, job.data);
  } catch (err) {
    logger.error({ err, job: job.name }, "failed to enqueue job");
  }
}
