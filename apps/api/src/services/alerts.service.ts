import {
  FEATURE_NAMES,
  FEATURE_SPEC,
  renderReason,
  type Band,
  type Features,
  type Reason,
  type ReviewAlertInput,
} from "@scamshield/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { conflict, notFound } from "../lib/errors";
import { enqueue } from "../lib/queue";
import { audit } from "./audit";
import { publishEvent } from "./events";
import { invalidatePayee } from "./redisState";
import { payeeNames } from "./wallet.service";

const FEATURE_DESCRIPTIONS = new Map(FEATURE_SPEC.features.map((f) => [f.name, f.description]));

const alertInclude = {
  decision: {
    include: { transaction: { include: { user: { select: { id: true, name: true, upiId: true, createdAt: true } } } } },
  },
  analyst: { select: { name: true } },
} satisfies Prisma.AlertInclude;

type AlertWithDecision = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

export function alertSummary(a: AlertWithDecision) {
  const d = a.decision;
  const t = d.transaction;
  const reasons = d.reasons as unknown as Reason[];
  return {
    id: a.id,
    status: a.status,
    outcome: a.outcome,
    createdAt: a.createdAt,
    reviewedAt: a.reviewedAt,
    analystName: a.analyst?.name ?? null,
    band: d.band as Band,
    score: d.finalScore,
    ruleScore: d.ruleScore,
    mlScore: d.mlScore,
    degraded: d.degraded,
    blocked: d.blocked,
    transactionId: t.id,
    transactionStatus: t.status,
    amount: Number(t.amount),
    payeeUpiId: t.payeeUpiId,
    userName: t.user.name,
    userUpiId: t.user.upiId,
    isSynthetic: t.isSynthetic,
    topReasons: reasons.slice(0, 3).map((r) => renderReason(r).title),
  };
}

export async function listAlerts(q: { page: number; pageSize: number; status?: "OPEN" | "REVIEWED"; band?: Band }) {
  const where: Prisma.AlertWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.band && { decision: { band: q.band } }),
  };
  const [total, rows, open] = await Promise.all([
    prisma.alert.count({ where }),
    prisma.alert.findMany({
      where,
      include: alertInclude,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.alert.count({ where: { status: "OPEN" } }),
  ]);
  return { page: q.page, pageSize: q.pageSize, total, openCount: open, items: rows.map(alertSummary) };
}

export async function getAlert(id: string) {
  const alert = await prisma.alert.findUnique({ where: { id }, include: alertInclude });
  if (!alert) throw notFound("Alert not found");
  const d = alert.decision;
  const t = d.transaction;
  const features = d.features as unknown as Features;
  const [payee, history, reports] = await Promise.all([
    prisma.payee.findUnique({ where: { upiId: t.payeeUpiId } }),
    prisma.transaction.findMany({
      where: { payeeUpiId: t.payeeUpiId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } }, decision: { select: { band: true, finalScore: true } } },
    }),
    prisma.payeeReport.findMany({ where: { payeeUpiId: t.payeeUpiId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const names = await payeeNames([t.payeeUpiId]);
  return {
    ...alertSummary(alert),
    notes: alert.notes,
    modelVersion: d.modelVersion,
    latencyMs: d.latencyMs,
    preContextScore: d.preContextScore,
    contextAnswers: d.contextAnswers,
    reasons: (d.reasons as unknown as Reason[]).map((r) => renderReason(r)),
    mlTopFeatures: d.mlTopFeatures,
    features: FEATURE_NAMES.map((name) => ({ name, value: features[name], description: FEATURE_DESCRIPTIONS.get(name) ?? "" })),
    user: { ...t.user, accountAgeDays: Math.floor((Date.now() - t.user.createdAt.getTime()) / 86_400_000) },
    payee: {
      upiId: t.payeeUpiId,
      displayName: names.get(t.payeeUpiId) ?? null,
      firstSeenAt: payee?.firstSeenAt ?? null,
      reportCount: payee?.reportCount ?? 0,
      reputationScore: payee?.reputationScore ?? 0,
      confirmedFraudAt: payee?.confirmedFraudAt ?? null,
      history: history.map((h) => ({
        id: h.id,
        userName: h.user.name,
        amount: Number(h.amount),
        status: h.status,
        createdAt: h.createdAt,
        band: h.decision?.band ?? null,
        score: h.decision?.finalScore ?? null,
      })),
      reports: reports.map((r) => ({ reason: r.reason, createdAt: r.createdAt })),
    },
  };
}

/** Analyst verdict: labels the transaction, and a FRAUD verdict marks the payee as confirmed fraud (hard override). */
export async function reviewAlert(id: string, analystId: string, input: ReviewAlertInput) {
  const alert = await prisma.alert.findUnique({ where: { id }, include: { decision: { include: { transaction: true } } } });
  if (!alert) throw notFound("Alert not found");
  if (alert.status === "REVIEWED") throw conflict("This alert was already reviewed");
  const txn = alert.decision.transaction;
  await prisma.$transaction(async (tx) => {
    await tx.alert.update({
      where: { id },
      data: { status: "REVIEWED", outcome: input.outcome, notes: input.notes, analystId, reviewedAt: new Date() },
    });
    await tx.transaction.update({ where: { id: txn.id }, data: { label: input.outcome } });
    if (input.outcome === "FRAUD") {
      await tx.payee.upsert({
        where: { upiId: txn.payeeUpiId },
        create: { upiId: txn.payeeUpiId, displayName: txn.payeeUpiId, confirmedFraudAt: new Date() },
        update: { confirmedFraudAt: new Date() },
      });
    }
  });
  await audit(analystId, `alert.review.${input.outcome.toLowerCase()}`, `Alert:${id}`, {
    transactionId: txn.id,
    payeeUpiId: txn.payeeUpiId,
    notes: input.notes,
  });
  await invalidatePayee(txn.payeeUpiId);
  await enqueue({ name: "payee-updated", data: { payeeUpiId: txn.payeeUpiId } });
  await publishEvent({ type: "alert-reviewed", alertId: id, outcome: input.outcome });
  return getAlert(id);
}
