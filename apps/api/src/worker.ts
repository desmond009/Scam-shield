import { Worker } from "bullmq";
import { aggregateMetrics, handleDecision, handlePaymentCompleted, updatePayeeReputation } from "./jobs/riskJobs";
import { retrain, syncModel } from "./jobs/modelJobs";
import { prisma } from "./lib/db";
import { logger } from "./lib/logger";
import { getModelQueue, getRiskQueue, MODEL_QUEUE, RISK_QUEUE } from "./lib/queue";
import { newRedisConnection } from "./lib/redis";

/**
 * Background worker: everything that does not need to block the payer. The API only enqueues; the worker updates
 * baselines and payee reputation, creates alerts and publishes live events, aggregates metrics, and manages models.
 */
const riskWorker = new Worker(
  RISK_QUEUE,
  async (job) => {
    switch (job.name) {
      case "decision":
        return handleDecision(job.data.decisionId);
      case "payment-completed":
        return handlePaymentCompleted(job.data);
      case "payee-updated":
        return updatePayeeReputation(job.data.payeeUpiId);
      case "metrics-aggregate":
        return aggregateMetrics();
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  },
  { connection: newRedisConnection(), concurrency: 8 },
);

const modelWorker = new Worker(
  MODEL_QUEUE,
  async (job) => {
    if (job.name === "model-sync") return syncModel();
    if (job.name === "model-retrain") return retrain(job);
    throw new Error(`Unknown job ${job.name}`);
  },
  // Retraining polls for minutes; a long lock keeps BullMQ from treating it as stalled.
  { connection: newRedisConnection(), concurrency: 1, lockDuration: 20 * 60_000 },
);

for (const w of [riskWorker, modelWorker]) {
  w.on("failed", (job, err) => logger.warn({ job: job?.name, attempts: job?.attemptsMade, err: err.message }, "job failed"));
}

async function schedule() {
  await getRiskQueue().upsertJobScheduler("metrics-aggregate", { every: 30_000 }, { name: "metrics-aggregate" });
  // Keeps the model registry in sync with whatever the ML service is serving (e.g. after `make train`).
  await getModelQueue().upsertJobScheduler("model-sync", { every: 60_000 }, { name: "model-sync", opts: { attempts: 1 } });
  await getModelQueue().add("model-sync", {}, { attempts: 20, backoff: { type: "fixed", delay: 10_000 } });
  await getRiskQueue().add("metrics-aggregate", {});
}

schedule()
  .then(() => logger.info("worker started"))
  .catch((err) => logger.error({ err }, "failed to schedule repeatable jobs"));

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await Promise.allSettled([riskWorker.close(), modelWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
