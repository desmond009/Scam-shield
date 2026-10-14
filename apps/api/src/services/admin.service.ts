import {
  DEFAULT_RULES,

  decide,
  evaluateRules,
  type Features,
  type RuleConfigEntry,
  type Thresholds,
} from "@scamshield/shared";
import { config } from "../config";
import { prisma } from "../lib/db";
import { HttpError } from "../lib/errors";
import { keys, TTL } from "../lib/keys";
import { getModelQueue, getRiskQueue } from "../lib/queue";
import { redis } from "../lib/redis";
import { getRiskConfig } from "./config.service";
import { sseClientCount } from "./events";
import { LATENCY_BUCKETS_MS, percentile } from "./metrics";
import { breakerState } from "./mlClient";

const ML_ADMIN_TIMEOUT_MS = 3_000;

export async function mlGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.ML_URL}${path}`, { signal: AbortSignal.timeout(ML_ADMIN_TIMEOUT_MS) });
  if (!res.ok) throw new HttpError(502, "ML_UNAVAILABLE", `ML service responded ${res.status}`);
  return (await res.json()) as T;
}

async function mlHealthy(): Promise<{ ok: boolean; modelVersion: string | null }> {
  try {
    const h = await mlGet<{ modelVersion: string | null }>("/health");
    return { ok: true, modelVersion: h.modelVersion };
  } catch {
    return { ok: false, modelVersion: null };
  }
}

export async function getRulesView() {
  const { rules } = await getRiskConfig();
  const rows = await prisma.ruleConfig.findMany({ select: { key: true, updatedBy: true, updatedAt: true } });
  const meta = new Map(rows.map((r) => [r.key, r]));
  return rules.map((r) => ({
    ...r,
    defaults: DEFAULT_RULES.find((d) => d.code === r.code)!,
    updatedAt: meta.get(r.code)?.updatedAt ?? null,
  }));
}

interface HoldoutRow {
  features: Features;
  mlScore: number;
  isFraud: 0 | 1;
  weight: number;
  scenario: string;
}

async function holdoutSample(): Promise<HoldoutRow[]> {
  const cached = await redis.get(keys.holdoutSample);
  if (cached) return JSON.parse(cached) as HoldoutRow[];
  const sample = await mlGet<{ rows: HoldoutRow[] }>("/holdout-sample").catch(() => {
    throw new HttpError(503, "ML_UNAVAILABLE", "The what-if preview needs the ML service (holdout sample)");
  });
  await redis.set(keys.holdoutSample, JSON.stringify(sample.rows), "EX", TTL.holdoutSampleSeconds);
  return sample.rows;
}

function simulate(rows: HoldoutRow[], rules: RuleConfigEntry[], t: Thresholds) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const bands = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const scenarioHits = new Map<string, { flagged: number; total: number; isFraud: boolean }>();
  for (const r of rows) {
    const res = evaluateRules(r.features, rules);
    const d = decide({ ruleScore: res.score, hits: res.hits, mlScore: r.mlScore, features: r.features, payeeConfirmedFraud: false, thresholds: t });
    const flagged = d.band !== "LOW";
    bands[d.band] += r.weight;
    if (r.isFraud) flagged ? (tp += r.weight) : (fn += r.weight);
    else flagged ? (fp += r.weight) : (tn += r.weight);
    const s = scenarioHits.get(r.scenario) ?? { flagged: 0, total: 0, isFraud: !!r.isFraud };
    s.flagged += flagged ? r.weight : 0;
    s.total += r.weight;
    scenarioHits.set(r.scenario, s);
  }
  const total = tp + fp + fn + tn;
  const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    precision: round(tp + fp ? tp / (tp + fp) : 0),
    recall: round(tp + fn ? tp / (tp + fn) : 0),
    fpr: round(fp + tn ? fp / (fp + tn) : 0, 5),
    flagRate: round((tp + fp) / total, 5),
    bands: { LOW: round(bands.LOW / total), MEDIUM: round(bands.MEDIUM / total), HIGH: round(bands.HIGH / total) },
    perScenario: [...scenarioHits.entries()].map(([scenario, s]) => ({ scenario, isFraud: s.isFraud, flaggedRate: round(s.flagged / s.total) })),
  };
}

/** Re-scores a labelled sample of the holdout under the current and the proposed configuration. */
export async function whatIf(proposed: { rules?: RuleConfigEntry[]; thresholds?: Thresholds }) {
  const rows = await holdoutSample();
  const current = await getRiskConfig();
  const merged = {
    rules: current.rules.map((r) => proposed.rules?.find((p) => p.code === r.code) ?? r),
    thresholds: proposed.thresholds ?? current.thresholds,
  };
  return {
    sampleSize: rows.length,
    note: "Labelled synthetic holdout sample (all fraud + weighted sample of legitimate payments). The ML score is fixed; only rules, weights and thresholds change.",
    current: simulate(rows, current.rules, current.thresholds),
    proposed: simulate(rows, merged.rules, merged.thresholds),
  };
}

export async function getModelInfo() {
  const [runs, live, training] = await Promise.all([
    prisma.modelRun.findMany({ orderBy: { trainedAt: "desc" }, take: 10 }),
    mlGet<{ version: string; metrics: unknown }>("/model").catch(() => null),
    mlGet<Record<string, unknown>>("/train/status").catch(() => null),
  ]);
  const jobs = await getModelQueue().getJobs(["active", "waiting", "completed", "failed"], 0, 5);
  return {
    active: runs.find((r) => r.active) ?? null,
    servingVersion: live?.version ?? null,
    liveMetrics: live?.metrics ?? null,
    training,
    history: runs.map((r) => ({ id: r.id, version: r.version, trainedAt: r.trainedAt, active: r.active })),
    recentJobs: await Promise.all(
      jobs
        .filter((j) => j.name === "model-retrain")
        .map(async (j) => ({ id: j.id, state: await j.getState(), progress: j.progress, failedReason: j.failedReason, timestamp: j.timestamp })),
    ),
  };
}

export async function requestRetrain(actorId: string) {
  const job = await getModelQueue().add("model-retrain", { requestedBy: actorId });
  return { jobId: job.id, status: "queued" };
}

export async function getEvaluation() {
  const run = await prisma.modelRun.findFirst({ where: { active: true } });
  const stored = (run?.metrics as { evaluation?: unknown } | null)?.evaluation;
  if (stored) return stored;
  return mlGet("/evaluation");
}

export async function getMetrics() {
  const [decisions, latency, samples, ml, summary, queueCounts, modelQueueCounts, ml_, breaker, dbOk, redisOk] =
    await Promise.all([
      redis.hgetall(keys.metricsDecisions),
      redis.hgetall(keys.metricsLatency),
      redis.lrange(keys.metricsLatencySamples, 0, -1),
      redis.hgetall(keys.metricsMl),
      redis.get(keys.metricsSummary),
      getRiskQueue().getJobCounts("waiting", "active", "delayed", "failed", "completed"),
      getModelQueue().getJobCounts("waiting", "active", "failed"),
      mlHealthy(),
      breakerState(),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then(() => true).catch(() => false),
    ]);
  const sorted = samples.map(Number).sort((a, b) => a - b);
  const n = (v: string | undefined) => Number(v ?? 0);
  return {
    decisionsByBand: { LOW: n(decisions.LOW), MEDIUM: n(decisions.MEDIUM), HIGH: n(decisions.HIGH) },
    latency: {
      samples: sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      histogram: [...LATENCY_BUCKETS_MS.map(String), "+Inf"].map((b) => ({ bucket: b, count: n(latency[b]) })),
    },
    ml: {
      calls: n(ml.calls),
      ok: n(ml.ok),
      fallbacks: n(ml.fallbacks),
      timeouts: n(ml.timeout),
      errors: n(ml.error),
      breakerOpenSkips: n(ml.breaker_open),
      breaker,
    },
    queue: { riskEvents: queueCounts, model: modelQueueCounts },
    services: {
      api: true,
      postgres: dbOk,
      redis: redisOk,
      ml: ml_.ok,
      mlModelVersion: ml_.modelVersion,
      worker: summary !== null,
    },
    liveClients: sseClientCount(),
    summary: summary ? JSON.parse(summary) : null,
  };
}

