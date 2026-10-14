import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../lib/db";
import { keys } from "../lib/keys";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import { mlGet } from "../services/admin.service";

const POLL_MS = 3_000;
const TRAINING_TIMEOUT_MS = 15 * 60_000;

interface MlModel {
  version: string;
  metrics: { trained_at: string } & Record<string, unknown>;
}

/** Registers the model the ML service is serving (with its evaluation) as the active ModelRun. */
export async function syncModel() {
  const live = await mlGet<MlModel>("/model");
  const evaluation = await mlGet<unknown>("/evaluation").catch(() => null);
  const metrics = { training: live.metrics, evaluation } as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.modelRun.updateMany({ where: { version: { not: live.version } }, data: { active: false } }),
    prisma.modelRun.upsert({
      where: { version: live.version },
      create: { version: live.version, metrics, trainedAt: new Date(live.metrics.trained_at), active: true },
      update: { metrics, active: true },
    }),
  ]);
  return live.version;
}

/** Retrain on synthetic data + analyst labels, wait for the ML service, then register the new model. */
export async function retrain(job: Job) {
  const reviewed = await prisma.alert.findMany({
    where: { status: "REVIEWED", outcome: { not: null } },
    select: { outcome: true, decision: { select: { features: true } } },
  });
  const labels = reviewed.map((a) => ({ features: a.decision.features, label: a.outcome === "FRAUD" ? 1 : 0 }));
  await job.updateProgress({ status: "submitting", analystLabels: labels.length });
  const res = await fetch(`${config.ML_URL}/train`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ labels }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ML /train responded ${res.status}: ${await res.text()}`);

  const deadline = Date.now() + TRAINING_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const status = await mlGet<{ status: string; error?: string; version?: string }>("/train/status").catch(() => null);
    if (status) await job.updateProgress({ ...status, analystLabels: labels.length });
    if (status?.status === "completed") break;
    if (status?.status === "failed") throw new Error(`Training failed: ${status.error}`);
    if (Date.now() > deadline) throw new Error("Training timed out");
  }
  const version = await syncModel();
  await redis.del(keys.holdoutSample);
  logger.info({ version, analystLabels: labels.length }, "retrained model registered");
  return { version, analystLabels: labels.length };
}
