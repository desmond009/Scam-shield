import featureSpec from "../spec/features.json";

export const FEATURE_SPEC = featureSpec;

export const FEATURE_NAMES = [
  "amount",
  "amount_zscore_vs_user_30d",
  "amount_to_user_max_ratio",
  "amount_to_balance_ratio",
  "is_new_payee_for_user",
  "payee_age_days",
  "payee_distinct_senders_24h",
  "payee_report_count",
  "user_txn_count_10min",
  "user_txn_count_1h",
  "same_amount_repeat_count_1h",
  "hour_of_day",
  "hour_deviation_from_user_norm",
  "is_night",
  "account_age_days",
  "is_new_device",
  "failed_attempts_15min",
  "ctx_pressure",
  "ctx_otp_or_app",
  "ctx_unknown_recipient",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Record<FeatureName, number>;

/** Summary of the user's completed payments in the baseline window (30 days). */
export interface HistoryStats {
  count: number;
  mean: number;
  /** Population standard deviation. */
  std: number;
  max: number;
  /** Sum of sin/cos of each payment's IST hour angle (2*pi*h/24); used for a circular mean hour. */
  hourSin: number;
  hourCos: number;
}

export interface ContextAnswers {
  pressure: boolean;
  otpOrApp: boolean;
  unknownRecipient: boolean;
}

/** Everything needed to compute features. Node fills it from Redis/Postgres, Python from the synthetic history. */
export interface FeatureInput {
  amount: number;
  balance: number;
  timestampMs: number;
  accountCreatedAtMs: number;
  history: HistoryStats;
  isNewPayee: boolean;
  payeeFirstSeenAtMs: number | null;
  payeeDistinctSenders24h: number;
  payeeReportCount: number;
  userTxnCount10min: number;
  userTxnCount1h: number;
  sameAmountRepeat1h: number;
  isNewDevice: boolean;
  failedAttempts15min: number;
  context: ContextAnswers | null;
}

const DAY_MS = 86_400_000;

export const emptyHistory = (): HistoryStats => ({ count: 0, mean: 0, std: 0, max: 0, hourSin: 0, hourCos: 0 });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const flag = (b: boolean) => (b ? 1 : 0);

export function istHour(timestampMs: number): number {
  const minutes = Math.floor(timestampMs / 60_000) + featureSpec.timezoneOffsetMinutes;
  return Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
}

export function hourAngle(hour: number): number {
  return (2 * Math.PI * hour) / 24;
}

export function isNightHour(hour: number): boolean {
  return hour >= featureSpec.nightStartHour || hour < featureSpec.nightEndHour;
}

function hourDeviation(hour: number, history: HistoryStats): number {
  if (history.count < featureSpec.minHistoryForStats) return 0;
  const meanAngle = Math.atan2(history.hourSin, history.hourCos);
  const meanHour = (((meanAngle * 24) / (2 * Math.PI)) % 24 + 24) % 24;
  const d = Math.abs(hour - meanHour);
  return Math.min(d, 24 - d);
}

function amountZscore(amount: number, h: HistoryStats): number {
  if (h.count < featureSpec.minHistoryForStats) return 0;
  const std = Math.max(h.std, 0.1 * h.mean, 50);
  return clamp((amount - h.mean) / std, -5, 20);
}

export function computeFeatures(input: FeatureInput): Features {
  const hour = istHour(input.timestampMs);
  const h = input.history;
  const ctx = input.context;
  const payeeAge =
    input.payeeFirstSeenAtMs === null ? 0 : clamp((input.timestampMs - input.payeeFirstSeenAtMs) / DAY_MS, 0, 3650);
  const raw: Features = {
    amount: input.amount,
    amount_zscore_vs_user_30d: amountZscore(input.amount, h),
    amount_to_user_max_ratio: h.count >= 1 && h.max > 0 ? clamp(input.amount / h.max, 0, 50) : 1,
    amount_to_balance_ratio: clamp(input.amount / Math.max(input.balance, 1), 0, 10),
    is_new_payee_for_user: flag(input.isNewPayee),
    payee_age_days: payeeAge,
    payee_distinct_senders_24h: input.payeeDistinctSenders24h,
    payee_report_count: input.payeeReportCount,
    user_txn_count_10min: input.userTxnCount10min,
    user_txn_count_1h: input.userTxnCount1h,
    same_amount_repeat_count_1h: input.sameAmountRepeat1h,
    hour_of_day: hour,
    hour_deviation_from_user_norm: hourDeviation(hour, h),
    is_night: flag(isNightHour(hour)),
    account_age_days: Math.max(0, (input.timestampMs - input.accountCreatedAtMs) / DAY_MS),
    is_new_device: flag(input.isNewDevice),
    failed_attempts_15min: input.failedAttempts15min,
    ctx_pressure: flag(!!ctx?.pressure),
    ctx_otp_or_app: flag(!!ctx?.otpOrApp),
    ctx_unknown_recipient: flag(!!ctx?.unknownRecipient),
  };
  const out = {} as Features;
  for (const name of FEATURE_NAMES) out[name] = round4(raw[name]);
  return out;
}

/** Returns a copy of the features with questionnaire answers applied. */
export function withContext(features: Features, ctx: ContextAnswers): Features {
  return {
    ...features,
    ctx_pressure: flag(ctx.pressure),
    ctx_otp_or_app: flag(ctx.otpOrApp),
    ctx_unknown_recipient: flag(ctx.unknownRecipient),
  };
}

export function toVector(features: Features): number[] {
  return FEATURE_NAMES.map((n) => features[n]);
}
