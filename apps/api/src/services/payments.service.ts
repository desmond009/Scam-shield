import {
  bandFor,
  withContext,
  type CheckRequest,
  type ContextRequest,
  type Features,
  type Reason,
} from "@scamshield/shared";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../lib/db";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../lib/errors";
import { enqueue } from "../lib/queue";
import { getRiskConfig } from "./config.service";
import { cooldownEndsAt, decisionView, type DecisionView } from "./decisionView";
import { buildFeatures } from "./featureBuilder";
import { recordDecisionMetrics } from "./metrics";
import { invalidatePayee, getPayeeInfo, recordCompletedPayment, recordFailure } from "./redisState";
import { assessRisk, type RiskAssessment } from "./riskEngine";

const CHECK_TOKEN_TTL_SECONDS = 10 * 60;

export interface RequestMeta {
  deviceHash: string;
  ip?: string;
  idempotencyKey?: string;
  /** Simulator traffic is marked synthetic so it can be filtered out of reports. */
  synthetic?: boolean;
}

interface CheckTokenPayload {
  sub: string;
  txn: string;
  amt: number;
  upi: string;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function signCheckToken(p: CheckTokenPayload): string {
  return jwt.sign(p, config.CHECK_TOKEN_SECRET, { expiresIn: CHECK_TOKEN_TTL_SECONDS, algorithm: "HS256" });
}

function verifyCheckToken(token: string): CheckTokenPayload {
  try {
    return jwt.verify(token, config.CHECK_TOKEN_SECRET, { algorithms: ["HS256"] }) as CheckTokenPayload;
  } catch {
    throw new HttpError(401, "INVALID_CHECK_TOKEN", "This payment check has expired. Please start the payment again.");
  }
}

function decisionData(risk: RiskAssessment, features: Features, latencyMs: number) {
  return {
    ruleScore: risk.rules.score,
    mlScore: risk.ml?.score ?? null,
    finalScore: risk.outcome.finalScore,
    band: risk.outcome.band,
    blocked: risk.outcome.blocked,
    reasons: json(risk.outcome.reasons),
    features: json(features),
    mlTopFeatures: risk.ml ? json(risk.ml.topFeatures) : Prisma.JsonNull,
    degraded: risk.outcome.degraded,
    modelVersion: risk.ml?.modelVersion ?? null,
    latencyMs: Math.round(latencyMs * 100) / 100,
  };
}

const tokenFor = (userId: string, txn: { id: string; amount: Prisma.Decimal; payeeUpiId: string }) =>
  signCheckToken({ sub: userId, txn: txn.id, amt: Number(txn.amount), upi: txn.payeeUpiId });

/** Phase 1: score a payment before any money moves. Creates a PENDING (or BLOCKED) transaction + decision. */
export async function checkPayment(userId: string, body: CheckRequest, meta: RequestMeta): Promise<DecisionView> {
  const started = performance.now();
  const now = Date.now();
  const built = await buildFeatures({ userId, payeeUpiId: body.payeeUpiId, amount: body.amount, deviceHash: meta.deviceHash, now });
  if (built.userUpiId === body.payeeUpiId) throw badRequest("You cannot send money to yourself");
  if (body.amount > built.input.balance) throw badRequest("Insufficient balance for this payment");

  const risk = await assessRisk(built.features, built.payee.confirmedFraud);
  const latencyMs = performance.now() - started;
  try {
    const txn = await prisma.transaction.create({
      data: {
        userId,
        payeeUpiId: body.payeeUpiId,
        amount: body.amount,
        note: body.note,
        status: risk.outcome.blocked ? "BLOCKED" : "PENDING",
        idempotencyKey: meta.idempotencyKey,
        createdAt: new Date(now),
        deviceHash: meta.deviceHash,
        ip: meta.ip,
        isSynthetic: !!meta.synthetic,
        decision: { create: decisionData(risk, built.features, latencyMs) },
      },
      include: { decision: true },
    });
    const decision = txn.decision!;
    await enqueue({ name: "decision", data: { decisionId: decision.id } });
    recordDecisionMetrics(decision.band, performance.now() - started);
    return decisionView(txn, decision, tokenFor(userId, txn), (await getRiskConfig()).thresholds);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("A payment with this Idempotency-Key already exists");
    }
    throw err;
  }
}

async function loadOwnedTransaction(userId: string, transactionId: string) {
  const txn = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { decision: true } });
  if (!txn || !txn.decision) throw notFound("Payment not found");
  if (txn.userId !== userId) throw forbidden();
  return { txn, decision: txn.decision };
}

/**
 * Questionnaire answers become ctx_* features and the payment is re-scored. Answers can only raise the score:
 * the final score is never lowered below the pre-questionnaire score, so the questionnaire cannot be used to
 * talk the system down.
 */
export async function answerContext(userId: string, transactionId: string, answers: ContextRequest): Promise<DecisionView> {
  const started = performance.now();
  const { txn, decision } = await loadOwnedTransaction(userId, transactionId);
  if (txn.status !== "PENDING") throw conflict("This payment is no longer pending");
  if (decision.contextAnswers !== null) throw conflict("The questions for this payment were already answered");

  const context = { pressure: answers.pressure, otpOrApp: answers.otpOrApp, unknownRecipient: !answers.knowRecipient };
  const features = withContext(decision.features as unknown as Features, context);
  const payee = await getPayeeInfo(txn.payeeUpiId);
  const risk = await assessRisk(features, payee.confirmedFraud);
  const { thresholds } = await getRiskConfig();
  const finalScore = Math.max(risk.outcome.finalScore, decision.finalScore);
  const band = bandFor(finalScore, thresholds);

  const updated = await prisma.riskDecision.update({
    where: { id: decision.id },
    data: {
      ...decisionData(risk, features, decision.latencyMs + (performance.now() - started)),
      finalScore,
      band,
      preContextScore: decision.finalScore,
      contextAnswers: json(answers),
      reasons: json(risk.outcome.reasons satisfies Reason[]),
    },
  });
  await enqueue({ name: "decision", data: { decisionId: decision.id } });
  return decisionView(txn, updated, tokenFor(userId, txn), thresholds);
}

/** Phase 2: move the money. Requires a valid check token; HIGH band also needs cooldown + retyped UPI ID. */
export async function confirmPayment(userId: string, checkToken: string, retypedUpiId: string | undefined) {
  const token = verifyCheckToken(checkToken);
  if (token.sub !== userId) throw forbidden("This payment check belongs to another user");
  const { txn, decision } = await loadOwnedTransaction(userId, token.txn);
  if (Number(txn.amount) !== token.amt || txn.payeeUpiId !== token.upi) {
    throw badRequest("Payment details changed after the risk check. Please start again.");
  }
  if (decision.blocked || txn.status === "BLOCKED") {
    throw new HttpError(403, "PAYMENT_BLOCKED", "This payment was stopped because the recipient is linked to scams");
  }
  if (txn.status !== "PENDING") throw conflict("This payment was already processed");
  if (decision.band === "HIGH") {
    const endsAt = cooldownEndsAt(decision)!;
    if (Date.now() < endsAt.getTime()) {
      throw new HttpError(425, "COOLDOWN_ACTIVE", "Please take a moment and wait for the safety timer to finish", {
        cooldownEndsAt: endsAt.toISOString(),
      });
    }
    if (retypedUpiId?.trim().toLowerCase() !== txn.payeeUpiId) {
      await recordFailure(userId);
      throw new HttpError(422, "VERIFICATION_FAILED", "The UPI ID you typed does not match the recipient");
    }
  }

  const amount = Number(txn.amount);
  const balance = await prisma.$transaction(async (tx) => {
    // Optimistic state transition: only one confirm can move PENDING -> COMPLETED.
    const moved = await tx.transaction.updateMany({
      where: { id: txn.id, status: "PENDING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (moved.count !== 1) throw conflict("This payment was already processed");
    // Guarded debit: never lets the balance go negative, even under concurrent confirms.
    const debited = await tx.user.updateMany({
      where: { id: userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (debited.count !== 1) throw badRequest("Insufficient balance for this payment");
    const payer = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
    await tx.ledgerEntry.create({ data: { userId, transactionId: txn.id, amount: -amount, balanceAfter: payer.balance } });
    const recipient = await tx.user.findUnique({ where: { upiId: txn.payeeUpiId }, select: { id: true, name: true } });
    if (recipient) {
      const credited = await tx.user.update({
        where: { id: recipient.id },
        data: { balance: { increment: amount } },
        select: { balance: true },
      });
      await tx.ledgerEntry.create({
        data: { userId: recipient.id, transactionId: txn.id, amount, balanceAfter: credited.balance },
      });
    }
    await tx.payee.upsert({
      where: { upiId: txn.payeeUpiId },
      create: { upiId: txn.payeeUpiId, displayName: recipient?.name ?? displayNameFromUpi(txn.payeeUpiId) },
      update: {},
    });
    return Number(payer.balance);
  });

  await recordCompletedPayment({
    txnId: txn.id,
    userId,
    upi: txn.payeeUpiId,
    amount,
    deviceHash: txn.deviceHash,
    at: Date.now(),
  });
  await invalidatePayee(txn.payeeUpiId);
  await enqueue({ name: "payment-completed", data: { transactionId: txn.id, userId, payeeUpiId: txn.payeeUpiId } });
  return { transactionId: txn.id, status: "COMPLETED" as const, amount, payeeUpiId: txn.payeeUpiId, balance };
}

export async function cancelPayment(userId: string, transactionId: string, report: boolean, reason?: string) {
  const { txn } = await loadOwnedTransaction(userId, transactionId);
  if (txn.status === "PENDING") {
    const moved = await prisma.transaction.updateMany({ where: { id: txn.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (moved.count !== 1) throw conflict("This payment was already processed");
  } else if (txn.status !== "BLOCKED") {
    throw conflict("Only pending or blocked payments can be cancelled");
  }
  if (report) await reportPayee(userId, txn.payeeUpiId, reason ?? "Reported while cancelling a risky payment");
  return { transactionId: txn.id, status: txn.status === "BLOCKED" ? "BLOCKED" : "CANCELLED", reported: report };
}

/** One report per user per payee; each new report raises the payee's reputation risk. */
export async function reportPayee(userId: string, payeeUpiId: string, reason: string) {
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.payeeReport.findUnique({ where: { reporterId_payeeUpiId: { reporterId: userId, payeeUpiId } } });
    if (existing) return false;
    await tx.payeeReport.create({ data: { reporterId: userId, payeeUpiId, reason } });
    await tx.payee.upsert({
      where: { upiId: payeeUpiId },
      create: { upiId: payeeUpiId, displayName: displayNameFromUpi(payeeUpiId), reportCount: 1 },
      update: { reportCount: { increment: 1 } },
    });
    return true;
  });
  if (created) {
    await invalidatePayee(payeeUpiId);
    await enqueue({ name: "payee-updated", data: { payeeUpiId } });
  }
  return { payeeUpiId, reported: true, alreadyReported: !created };
}

export function displayNameFromUpi(upi: string): string {
  return upi
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
