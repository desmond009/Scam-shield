import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  DEFAULT_THRESHOLDS,
  bandFor,
  computeFeatures,
  decide,
  emptyHistory,
  evaluateRules,
  istHour,
  renderReason,
  summarize,
  withContext,
  type FeatureInput,
} from "../src";

const NOW = Date.UTC(2026, 9, 14, 8, 30); // 14:00 IST
const DAY = 86_400_000;

function baseInput(overrides: Partial<FeatureInput> = {}): FeatureInput {
  return {
    amount: 500,
    balance: 20_000,
    timestampMs: NOW,
    accountCreatedAtMs: NOW - 400 * DAY,
    history: { count: 40, mean: 450, std: 150, max: 1200, hourSin: 0, hourCos: -40 }, // mean hour 12
    isNewPayee: false,
    payeeFirstSeenAtMs: NOW - 300 * DAY,
    payeeDistinctSenders24h: 0,
    payeeReportCount: 0,
    userTxnCount10min: 0,
    userTxnCount1h: 0,
    sameAmountRepeat1h: 0,
    isNewDevice: false,
    failedAttempts15min: 0,
    context: null,
    ...overrides,
  };
}

describe("computeFeatures", () => {
  it("converts timestamps to IST hours", () => {
    expect(istHour(NOW)).toBe(14);
    expect(istHour(Date.UTC(2026, 0, 1, 18, 45))).toBe(0);
  });

  it("produces neutral features for a normal payment", () => {
    const f = computeFeatures(baseInput());
    expect(f.is_new_payee_for_user).toBe(0);
    expect(f.amount_zscore_vs_user_30d).toBeCloseTo(0.3333, 3);
    expect(f.hour_deviation_from_user_norm).toBe(2);
    expect(f.is_night).toBe(0);
    expect(evaluateRules(f).score).toBe(0);
  });

  it("uses neutral defaults without history", () => {
    const f = computeFeatures(baseInput({ history: emptyHistory(), payeeFirstSeenAtMs: null, isNewPayee: true }));
    expect(f.amount_zscore_vs_user_30d).toBe(0);
    expect(f.amount_to_user_max_ratio).toBe(1);
    expect(f.hour_deviation_from_user_norm).toBe(0);
    expect(f.payee_age_days).toBe(0);
  });

  it("floors the standard deviation so tiny variance does not explode the z-score", () => {
    const f = computeFeatures(baseInput({ amount: 600, history: { ...baseInput().history, std: 1, mean: 500 } }));
    expect(f.amount_zscore_vs_user_30d).toBe(2); // (600-500)/max(1, 50, 50)
  });
});

describe("rules + blend", () => {
  it("flags an impersonation-style payment and explains it", () => {
    const f = computeFeatures(baseInput({ amount: 9600, isNewPayee: true, payeeFirstSeenAtMs: NOW - DAY }));
    const rules = evaluateRules(f);
    expect(rules.hits.map((h) => h.code)).toEqual(["AMOUNT_SPIKE", "NEW_PAYEE"]);
    const d = decide({ ruleScore: rules.score, hits: rules.hits, mlScore: 60, features: f, payeeConfirmedFraud: false, thresholds: DEFAULT_THRESHOLDS });
    expect(d.finalScore).toBe(52);
    expect(d.band).toBe("MEDIUM");
    expect(summarize(d.band, d.reasons)).toBe(
      "This payment looks unusual. The amount is 8x your largest recent payment and the recipient is new to you.",
    );
  });

  it("falls back to rules-only when the ML score is missing", () => {
    const f = computeFeatures(baseInput());
    const d = decide({ ruleScore: 40, hits: [], mlScore: null, features: f, payeeConfirmedFraud: false, thresholds: DEFAULT_THRESHOLDS });
    expect(d).toMatchObject({ finalScore: 40, band: "MEDIUM", degraded: true });
  });

  it("applies hard overrides", () => {
    const f = withContext(computeFeatures(baseInput()), { pressure: false, otpOrApp: true, unknownRecipient: false });
    const d = decide({ ruleScore: 0, hits: [], mlScore: 1, features: f, payeeConfirmedFraud: true, thresholds: DEFAULT_THRESHOLDS });
    expect(d.band).toBe("HIGH");
    expect(d.blocked).toBe(true);
    expect(d.overrides).toEqual(["CONFIRMED_FRAUD_PAYEE", "OTP_REQUESTED"]);
    expect(renderReason(d.reasons[0]).message).toMatch(/confirmed/);
  });

  it("respects disabled rules and weights", () => {
    const f = computeFeatures(baseInput({ isNewPayee: true, isNewDevice: true }));
    const cfg = DEFAULT_RULES.map((r) =>
      r.code === "NEW_PAYEE" ? { ...r, enabled: false } : r.code === "NEW_DEVICE" ? { ...r, weight: 2 } : r,
    );
    expect(evaluateRules(f, cfg)).toMatchObject({ score: 30, hits: [{ code: "NEW_DEVICE", points: 30 }] });
  });

  it("maps scores to bands at the configured thresholds", () => {
    expect([0, 34.9, 35, 69.9, 70].map((s) => bandFor(s, DEFAULT_THRESHOLDS))).toEqual(["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH"]);
  });
});
