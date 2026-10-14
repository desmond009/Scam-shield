import { prisma } from "../lib/db";
import { keys } from "../lib/keys";
import { redis } from "../lib/redis";
import { alertSummary } from "../services/alerts.service";
import { publishEvent } from "../services/events";
import { invalidatePayee, payeeDistinctSenders, refreshProfile } from "../services/redisState";

const DAY = 86_400_000;

/** MEDIUM/HIGH decisions become analyst alerts and are pushed live to the console. */
export async function handleDecision(decisionId: string) {
  const decision = await prisma.riskDecision.findUnique({ where: { id: decisionId }, select: { band: true, alert: true } });
  if (!decision || decision.band === "LOW") return;
  const alert = await prisma.alert.upsert({
    where: { decisionId },
    create: { decisionId },
    update: {},
    include: {
      decision: { include: { transaction: { include: { user: { select: { id: true, name: true, upiId: true, createdAt: true } } } } } },
      analyst: { select: { name: true } },
    },
  });
  await publishEvent({ type: "alert", escalated: decision.alert !== null, alert: alertSummary(alert) });
}

/** Payee reputation 0-100 from reports, analyst-confirmed fraud and the mule pattern (informational score). */
export async function updatePayeeReputation(upi: string) {
  const payee = await prisma.payee.findUnique({ where: { upiId: upi } });
  if (!payee) return;
  const senders = await payeeDistinctSenders(upi, "", Date.now());
  const ageDays = (Date.now() - payee.firstSeenAt.getTime()) / DAY;
  const score = Math.min(
    100,
    payee.reportCount * 15 + (payee.confirmedFraudAt ? 60 : 0) + (senders >= 5 && ageDays < 30 ? 25 : 0),
  );
  await prisma.payee.update({ where: { upiId: upi }, data: { reputationScore: score } });
  await invalidatePayee(upi);
}

export async function handlePaymentCompleted(data: { userId: string; payeeUpiId: string }) {
  await refreshProfile(data.userId);
  await updatePayeeReputation(data.payeeUpiId);
}

/** Periodic roll-up for the System Health page; its presence also signals that the worker is alive. */
export async function aggregateMetrics() {
  const since = new Date(Date.now() - DAY);
  const [byBand, degraded, openAlerts, lastHour, latency] = await Promise.all([
    prisma.riskDecision.groupBy({ by: ["band"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.riskDecision.count({ where: { createdAt: { gte: since }, degraded: true } }),
    prisma.alert.count({ where: { status: "OPEN" } }),
    prisma.riskDecision.count({ where: { createdAt: { gte: new Date(Date.now() - 3_600_000) } } }),
    prisma.riskDecision.aggregate({ where: { createdAt: { gte: since } }, _avg: { latencyMs: true } }),
  ]);
  const summary = {
    generatedAt: new Date().toISOString(),
    last24h: {
      byBand: Object.fromEntries(byBand.map((b) => [b.band, b._count])),
      degraded,
      avgDecisionLatencyMs: latency._avg.latencyMs,
    },
    decisionsLastHour: lastHour,
    openAlerts,
  };
  await redis.set(keys.metricsSummary, JSON.stringify(summary), "EX", 90);
  return summary;
}
