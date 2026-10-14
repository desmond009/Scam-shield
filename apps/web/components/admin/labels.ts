import { REASON_CATALOG, type RuleCode } from "@scamshield/shared";
import type { SystemKey } from "@/lib/types";

/** Series colour follows the system on every chart: Rules only = 1, ML only = 2, Hybrid = 3. */
export const SYSTEMS: { key: SystemKey; label: string; short: string; color: string }[] = [
  { key: "rules_only", label: "Rules only", short: "Rules", color: "var(--series-1)" },
  { key: "ml_only", label: "ML only", short: "ML", color: "var(--series-2)" },
  { key: "hybrid", label: "Hybrid (rules + ML)", short: "Hybrid", color: "var(--series-3)" },
];

export const SYSTEM_BY_KEY = Object.fromEntries(SYSTEMS.map((s) => [s.key, s])) as Record<SystemKey, (typeof SYSTEMS)[number]>;

export const ruleTitle = (code: string) => REASON_CATALOG.en[code as RuleCode]?.title ?? humanize(code);

const PARAM_LABELS: Record<string, string> = {
  points: "Points",
  minZscore: "Min z-score vs 30-day mean",
  minMaxRatio: "Min ratio to 30-day largest",
  minBalanceRatio: "Min share of balance",
  min10min: "Payments in 10 min",
  min1h: "Payments in 1 hour",
  minRepeats: "Min similar repeats in 1 hour",
  minHourDeviation: "Min hours from usual time",
  minDistinctSenders: "Min distinct senders",
  maxPayeeAgeDays: "Max recipient age (days)",
  pointsPerExtraReport: "Points per extra report",
  maxPoints: "Max points",
  minFailures: "Min failed attempts",
  pressurePoints: "Points: urged to pay",
  otpPoints: "Points: OTP or app request",
  unknownRecipientPoints: "Points: unknown recipient",
};

/** Ratio params accept decimals; everything else is a whole number. */
export const PARAM_STEP: Record<string, number> = { minZscore: 0.1, minMaxRatio: 0.1, minBalanceRatio: 0.05 };

function humanize(name: string) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const paramLabel = (name: string) => PARAM_LABELS[name] ?? humanize(name);

const FEATURE_LABELS: Record<string, string> = {
  amount: "Amount",
  amount_zscore_vs_user_30d: "Amount vs usual (z-score)",
  amount_to_user_max_ratio: "Amount vs largest recent payment",
  amount_to_balance_ratio: "Share of balance",
  is_new_payee_for_user: "New recipient",
  payee_age_days: "Recipient account age",
  payee_distinct_senders_24h: "Distinct senders to recipient (24 h)",
  payee_report_count: "Reports against recipient",
  user_txn_count_10min: "Payments in last 10 min",
  user_txn_count_1h: "Payments in last hour",
  same_amount_repeat_count_1h: "Similar amounts repeated (1 h)",
  hour_of_day: "Hour of day",
  hour_deviation_from_user_norm: "Hours from usual payment time",
  is_night: "Night-time payment",
  account_age_days: "Payer account age",
  is_new_device: "New device",
  failed_attempts_15min: "Failed attempts (15 min)",
  ctx_pressure: "Questionnaire: urged to pay",
  ctx_otp_or_app: "Questionnaire: OTP or app request",
  ctx_unknown_recipient: "Questionnaire: unknown recipient",
};

export const featureName = (f: string) => FEATURE_LABELS[f] ?? humanize(f);

const SCENARIO_LABELS: Record<string, string> = {
  legit: "Everyday payments",
  legit_batch: "Batch payments",
  legit_festival: "Festival spending",
  legit_new_contact: "New contact",
  legit_new_merchant: "New merchant",
  legit_new_payee: "New recipient",
  impersonation: "Impersonation",
  mule: "Mule collection",
  velocity: "Velocity drain",
  takeover: "Account takeover",
};

export const scenarioName = (s: string) => SCENARIO_LABELS[s] ?? humanize(s);

/** Rates are 0-1; shown as percentages. Points deltas are in percentage points. */
export const pctPoints = (delta: number, digits = 1) => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta * 100).toFixed(digits)} pts`;
