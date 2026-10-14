import type { Features } from "./features";
import type { Band, OverrideCode, Reason } from "./reasons";
import type { RuleHit, Thresholds } from "./rules";

export const ML_REASON_MIN_SCORE = 50;
export const CONFIRMED_FRAUD_FLOOR = 95;

export interface DecisionInput {
  ruleScore: number;
  hits: RuleHit[];
  /** Calibrated ML probability x 100, or null when the ML service is unavailable (degraded mode). */
  mlScore: number | null;
  features: Features;
  payeeConfirmedFraud: boolean;
  thresholds: Thresholds;
}

export interface DecisionOutcome {
  finalScore: number;
  band: Band;
  /** True when the payment must not proceed at all (confirmed scam recipient). */
  blocked: boolean;
  degraded: boolean;
  overrides: OverrideCode[];
  /** Ordered by importance: overrides, rule hits by points, then the ML signal. */
  reasons: Reason[];
}

export function bandFor(score: number, t: Thresholds): Band {
  if (score >= t.highThreshold) return "HIGH";
  if (score >= t.mediumThreshold) return "MEDIUM";
  return "LOW";
}

export function blendScores(ruleScore: number, mlScore: number | null, t: Thresholds): number {
  const raw = mlScore === null ? ruleScore : t.ruleWeight * ruleScore + t.mlWeight * mlScore;
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}

export function decide(input: DecisionInput): DecisionOutcome {
  const { thresholds: t } = input;
  let finalScore = blendScores(input.ruleScore, input.mlScore, t);
  const overrides: OverrideCode[] = [];
  if (input.payeeConfirmedFraud) {
    overrides.push("CONFIRMED_FRAUD_PAYEE");
    finalScore = Math.max(finalScore, CONFIRMED_FRAUD_FLOOR);
  }
  if (input.features.ctx_otp_or_app === 1) {
    overrides.push("OTP_REQUESTED");
    finalScore = Math.max(finalScore, t.highThreshold);
  }

  const reasons: Reason[] = [
    ...overrides.map((code) => ({ code, points: 100, vars: {} })),
    ...input.hits.map((h) => ({ code: h.code, points: h.points, vars: h.vars })),
  ];
  if (input.mlScore !== null && input.mlScore >= ML_REASON_MIN_SCORE) {
    reasons.push({ code: "ML_PATTERN", points: Math.round(input.mlScore * t.mlWeight), vars: { mlScore: Math.round(input.mlScore) } });
  }

  return {
    finalScore,
    band: bandFor(finalScore, t),
    blocked: input.payeeConfirmedFraud,
    degraded: input.mlScore === null,
    overrides,
    reasons,
  };
}
