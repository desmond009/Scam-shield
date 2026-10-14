import {
  HIGH_RISK_COOLDOWN_SECONDS,
  MAX_USER_REASONS,
  renderReason,
  summarize,
  type Band,
  type Reason,
} from "@scamshield/shared";
import type { RiskDecision, Transaction } from "@prisma/client";

export function cooldownEndsAt(decision: Pick<RiskDecision, "band" | "updatedAt">): Date | null {
  return decision.band === "HIGH" ? new Date(decision.updatedAt.getTime() + HIGH_RISK_COOLDOWN_SECONDS * 1000) : null;
}

/** What the payer's app receives: score, band, plain-language top reasons and what the UI must do next. */
export function decisionView(txn: Transaction, decision: RiskDecision, checkToken?: string) {
  const reasons = decision.reasons as unknown as Reason[];
  const band = decision.band as Band;
  const contextAnswered = decision.contextAnswers !== null;
  const pending = txn.status === "PENDING";
  return {
    transactionId: txn.id,
    decisionId: decision.id,
    status: txn.status,
    payeeUpiId: txn.payeeUpiId,
    amount: Number(txn.amount),
    score: decision.finalScore,
    band,
    blocked: decision.blocked,
    degraded: decision.degraded,
    summary: summarize(band, reasons),
    reasons: reasons.slice(0, MAX_USER_REASONS).map((r) => renderReason(r)),
    ruleScore: decision.ruleScore,
    mlScore: decision.mlScore,
    preContextScore: decision.preContextScore,
    modelVersion: decision.modelVersion,
    latencyMs: decision.latencyMs,
    contextAnswered,
    requiresContext: pending && band !== "LOW" && !decision.blocked && !contextAnswered,
    requiresVerification: pending && band === "HIGH" && !decision.blocked,
    cooldownSeconds: band === "HIGH" ? HIGH_RISK_COOLDOWN_SECONDS : 0,
    cooldownEndsAt: cooldownEndsAt(decision)?.toISOString() ?? null,
    checkToken: pending && !decision.blocked ? checkToken : undefined,
  };
}

export type DecisionView = ReturnType<typeof decisionView>;
