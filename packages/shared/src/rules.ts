import ruleSpec from "../spec/rules.json";
import type { Features } from "./features";

export const RULE_CODES = [
  "NEW_PAYEE",
  "AMOUNT_SPIKE",
  "DRAIN_BALANCE",
  "VELOCITY_BURST",
  "SPLIT_PAYMENTS",
  "ODD_HOUR",
  "MULE_PATTERN",
  "REPORTED_PAYEE",
  "NEW_DEVICE",
  "REPEATED_FAILED_ATTEMPTS",
  "CONTEXT_PRESSURE",
] as const;

export type RuleCode = (typeof RULE_CODES)[number];

export interface RuleConfigEntry {
  code: RuleCode;
  enabled: boolean;
  weight: number;
  params: Record<string, number>;
}

export interface Thresholds {
  ruleWeight: number;
  mlWeight: number;
  mediumThreshold: number;
  highThreshold: number;
}

export interface RuleHit {
  code: RuleCode;
  /** Points after the rule weight is applied. */
  points: number;
  /** Values substituted into the reason templates. */
  vars: Record<string, string | number>;
}

export interface RuleResult {
  score: number;
  hits: RuleHit[];
}

export const DEFAULT_RULES = ruleSpec.rules as unknown as RuleConfigEntry[];
export const DEFAULT_THRESHOLDS: Thresholds = ruleSpec.thresholds;

type RuleFn = (f: Features, p: Record<string, number>) => { points: number; vars: RuleHit["vars"] } | null;

const one = (n: number) => Math.round(n * 10) / 10;

const RULES: Record<RuleCode, RuleFn> = {
  NEW_PAYEE: (f, p) => (f.is_new_payee_for_user === 1 ? { points: p.points, vars: {} } : null),
  AMOUNT_SPIKE: (f, p) =>
    f.amount_zscore_vs_user_30d >= p.minZscore || f.amount_to_user_max_ratio >= p.minMaxRatio
      ? { points: p.points, vars: { ratio: one(f.amount_to_user_max_ratio), zscore: one(f.amount_zscore_vs_user_30d) } }
      : null,
  DRAIN_BALANCE: (f, p) =>
    f.amount_to_balance_ratio >= p.minBalanceRatio
      ? { points: p.points, vars: { pct: Math.round(Math.min(f.amount_to_balance_ratio, 1) * 100) } }
      : null,
  VELOCITY_BURST: (f, p) =>
    f.user_txn_count_10min >= p.min10min || f.user_txn_count_1h >= p.min1h
      ? { points: p.points, vars: { count10: f.user_txn_count_10min, count1h: f.user_txn_count_1h } }
      : null,
  SPLIT_PAYMENTS: (f, p) =>
    f.same_amount_repeat_count_1h >= p.minRepeats
      ? { points: p.points, vars: { repeats: f.same_amount_repeat_count_1h } }
      : null,
  ODD_HOUR: (f, p) =>
    f.is_night === 1 && f.hour_deviation_from_user_norm >= p.minHourDeviation
      ? { points: p.points, vars: { hour: f.hour_of_day, deviation: one(f.hour_deviation_from_user_norm) } }
      : null,
  MULE_PATTERN: (f, p) =>
    f.payee_distinct_senders_24h >= p.minDistinctSenders && f.payee_age_days <= p.maxPayeeAgeDays
      ? { points: p.points, vars: { senders: f.payee_distinct_senders_24h, ageDays: one(f.payee_age_days) } }
      : null,
  REPORTED_PAYEE: (f, p) =>
    f.payee_report_count >= 1
      ? {
          points: Math.min(p.maxPoints, p.points + (f.payee_report_count - 1) * p.pointsPerExtraReport),
          vars: { reports: f.payee_report_count },
        }
      : null,
  NEW_DEVICE: (f, p) => (f.is_new_device === 1 ? { points: p.points, vars: {} } : null),
  REPEATED_FAILED_ATTEMPTS: (f, p) =>
    f.failed_attempts_15min >= p.minFailures ? { points: p.points, vars: { failures: f.failed_attempts_15min } } : null,
  CONTEXT_PRESSURE: (f, p) => {
    const points =
      f.ctx_pressure * p.pressurePoints + f.ctx_otp_or_app * p.otpPoints + f.ctx_unknown_recipient * p.unknownRecipientPoints;
    if (points === 0) return null;
    return {
      points,
      vars: { pressure: f.ctx_pressure, otpOrApp: f.ctx_otp_or_app, unknownRecipient: f.ctx_unknown_recipient },
    };
  },
};

export function evaluateRules(features: Features, configs: RuleConfigEntry[] = DEFAULT_RULES): RuleResult {
  const hits: RuleHit[] = [];
  for (const cfg of configs) {
    if (!cfg.enabled || !(cfg.code in RULES)) continue;
    const res = RULES[cfg.code](features, cfg.params);
    if (res) hits.push({ code: cfg.code, points: Math.round(res.points * cfg.weight * 100) / 100, vars: res.vars });
  }
  hits.sort((a, b) => b.points - a.points);
  const total = hits.reduce((s, h) => s + h.points, 0);
  return { score: Math.round(Math.min(100, total) * 100) / 100, hits };
}
