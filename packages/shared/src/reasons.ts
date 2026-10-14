import type { RuleCode } from "./rules";

export type OverrideCode = "CONFIRMED_FRAUD_PAYEE" | "OTP_REQUESTED";
export type ReasonCode = RuleCode | OverrideCode | "ML_PATTERN";
export type Band = "LOW" | "MEDIUM" | "HIGH";

export interface Reason {
  code: ReasonCode;
  points: number;
  vars: Record<string, string | number>;
}

type Vars = Reason["vars"];

export interface ReasonText {
  title: string;
  /** Plain-language sentence shown to the payer. */
  user: (v: Vars) => string;
  /** Short lowercase clause used to compose the one-line summary. */
  phrase: (v: Vars) => string;
  /** Technical detail shown to analysts. */
  analyst: (v: Vars) => string;
}

export type Locale = "en";

const plural = (n: string | number, word: string) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;

function contextList(v: Vars): string[] {
  const out: string[] = [];
  if (Number(v.pressure)) out.push("someone asked you to pay urgently");
  if (Number(v.otpOrApp)) out.push("you were asked to share an OTP or install an app");
  if (Number(v.unknownRecipient)) out.push("you do not personally know the recipient");
  return out;
}

const EN: Record<ReasonCode, ReasonText> = {
  NEW_PAYEE: {
    title: "New recipient",
    user: () => "You have never paid this recipient before.",
    phrase: () => "the recipient is new to you",
    analyst: () => "No prior completed payment from this user to the payee.",
  },
  AMOUNT_SPIKE: {
    title: "Unusually large amount",
    user: (v) =>
      Number(v.ratio) >= 1.5
        ? `This amount is ${v.ratio}x your largest payment in the last 30 days.`
        : "This amount is much higher than what you usually pay.",
    phrase: (v) =>
      Number(v.ratio) >= 1.5 ? `the amount is ${v.ratio}x your largest recent payment` : "the amount is far above your usual",
    analyst: (v) => `Amount z-score ${v.zscore} vs 30-day history; ${v.ratio}x the 30-day max.`,
  },
  DRAIN_BALANCE: {
    title: "Most of your balance",
    user: (v) => `This payment would use ${v.pct}% of your balance.`,
    phrase: (v) => `it would use ${v.pct}% of your balance`,
    analyst: (v) => `Amount is ${v.pct}% of the pre-payment balance.`,
  },
  VELOCITY_BURST: {
    title: "Many payments in a short time",
    user: (v) =>
      Number(v.count10) >= 3
        ? `You have made ${plural(v.count10, "payment")} in the last 10 minutes.`
        : `You have made ${plural(v.count1h, "payment")} in the last hour.`,
    phrase: () => "you are making many payments very quickly",
    analyst: (v) => `${v.count10} completed payments in 10 min, ${v.count1h} in 1 h.`,
  },
  SPLIT_PAYMENTS: {
    title: "Repeated similar payments",
    user: (v) => `You have already sent ${plural(v.repeats, "similar amount")} to this recipient in the last hour.`,
    phrase: () => "similar amounts were already sent to this recipient",
    analyst: (v) => `${v.repeats} payments within 20% of this amount to the same payee in 1 h (possible split).`,
  },
  ODD_HOUR: {
    title: "Unusual time",
    user: (v) => `You are paying at ${String(v.hour).padStart(2, "0")}:00, a time you don't usually make payments.`,
    phrase: () => "it is an unusual time of night for you",
    analyst: (v) => `Night-time payment at hour ${v.hour}, ${v.deviation} h from the user's mean payment hour.`,
  },
  MULE_PATTERN: {
    title: "Recipient collecting from many people",
    user: (v) => `This recipient is new and received money from ${plural(v.senders, "different person")} in the last 24 hours.`,
    phrase: () => "the recipient is collecting money from many people",
    analyst: (v) => `${v.senders} distinct senders in 24 h; payee age ${v.ageDays} days (mule pattern).`,
  },
  REPORTED_PAYEE: {
    title: "Recipient reported by others",
    user: (v) => `Other users have reported this recipient ${plural(v.reports, "time")}.`,
    phrase: () => "other users have reported this recipient",
    analyst: (v) => `${v.reports} user reports against the payee.`,
  },
  NEW_DEVICE: {
    title: "New device",
    user: () => "This payment is being made from a device you have not used before.",
    phrase: () => "it comes from a new device",
    analyst: () => "Device hash not seen in the user's completed payments.",
  },
  REPEATED_FAILED_ATTEMPTS: {
    title: "Failed attempts",
    user: (v) => `There were ${plural(v.failures, "failed sign-in or verification attempt")} in the last 15 minutes.`,
    phrase: () => "there were recent failed sign-in attempts",
    analyst: (v) => `${v.failures} failed logins/verifications in 15 min (possible account takeover).`,
  },
  CONTEXT_PRESSURE: {
    title: "Signs of pressure",
    user: (v) => {
      const items = contextList(v);
      return `You told us that ${items.join(", and ")}.`;
    },
    phrase: (v) => contextList(v)[0] ?? "you reported signs of pressure",
    analyst: (v) =>
      `Questionnaire: pressure=${v.pressure}, otp_or_app=${v.otpOrApp}, unknown_recipient=${v.unknownRecipient}.`,
  },
  CONFIRMED_FRAUD_PAYEE: {
    title: "Confirmed scam recipient",
    user: () => "Our fraud team has confirmed this recipient is linked to scams. This payment has been stopped.",
    phrase: () => "this recipient is confirmed as linked to scams",
    analyst: () => "Hard override: payee has an analyst-confirmed FRAUD label.",
  },
  OTP_REQUESTED: {
    title: "OTP or app request",
    user: () => "Someone asked you to share an OTP or install an app. Banks and genuine sellers never ask for this.",
    phrase: () => "someone asked you for an OTP or to install an app",
    analyst: () => "Hard override: questionnaire reports an OTP/remote-access app request.",
  },
  ML_PATTERN: {
    title: "Matches known scam patterns",
    user: () => "This payment resembles patterns seen in past scams.",
    phrase: () => "it resembles patterns seen in past scams",
    analyst: (v) => `ML model score ${v.mlScore}/100.`,
  },
};

export const REASON_CATALOG: Record<Locale, Record<ReasonCode, ReasonText>> = { en: EN };

export const MAX_USER_REASONS = 3;

export interface RenderedReason {
  code: ReasonCode;
  title: string;
  message: string;
  detail: string;
  points: number;
}

export function renderReason(r: Reason, locale: Locale = "en"): RenderedReason {
  const t = REASON_CATALOG[locale][r.code];
  return { code: r.code, title: t.title, message: t.user(r.vars), detail: t.analyst(r.vars), points: r.points };
}

const HEADLINES: Record<Locale, Record<Band, string>> = {
  en: {
    LOW: "This payment looks normal.",
    MEDIUM: "This payment looks unusual.",
    HIGH: "This payment shows strong signs of a scam.",
  },
};

/** One-line explanation, e.g. "This payment looks unusual. The recipient is new to you and the amount is 8x ...". */
export function summarize(band: Band, reasons: Reason[], locale: Locale = "en"): string {
  const headline = HEADLINES[locale][band];
  if (band === "LOW" || reasons.length === 0) return headline;
  const phrases = reasons.slice(0, 2).map((r) => REASON_CATALOG[locale][r.code].phrase(r.vars));
  const sentence = phrases.join(" and ");
  return `${headline} ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
