import type { Band, Role, TxnStatus } from "@scamshield/shared";

export type { Band, Role, TxnStatus };

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  upiId: string;
  balance: number;
  createdAt: string;
}

export interface RenderedReason {
  code: string;
  title: string;
  message: string;
  detail: string;
  points: number;
}

export interface Decision {
  transactionId: string;
  decisionId: string;
  status: TxnStatus;
  payeeUpiId: string;
  amount: number;
  score: number;
  band: Band;
  blocked: boolean;
  degraded: boolean;
  summary: string;
  reasons: RenderedReason[];
  ruleScore: number;
  mlScore: number | null;
  preContextScore: number | null;
  modelVersion: string | null;
  latencyMs: number;
  contextAnswered: boolean;
  requiresContext: boolean;
  requiresVerification: boolean;
  cooldownSeconds: number;
  cooldownEndsAt: string | null;
  checkToken?: string;
  thresholds?: { medium: number; high: number };
}

export interface ConfirmResult {
  transactionId: string;
  status: "COMPLETED";
  amount: number;
  payeeUpiId: string;
  balance: number;
}

export interface PayeeLookup {
  upiId: string;
  displayName: string | null;
  onPlatform: boolean;
  ageDays: number | null;
  reportCount: number;
  confirmedFraud: boolean;
  paidBefore: boolean;
}

export interface Wallet {
  name: string;
  upiId: string;
  balance: number;
  last30Days: { spent: number; payments: number; warnings: number };
  dailySpending: { day: string; total: number; count: number }[];
}

export interface TxnItem {
  id: string;
  payeeUpiId: string;
  payeeName: string | null;
  amount: number;
  note: string | null;
  status: TxnStatus;
  createdAt: string;
  band: Band | null;
  score: number | null;
}

export interface Page<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}

export interface Safety {
  warnings: { transactionId: string; payeeUpiId: string; amount: number; status: TxnStatus; createdAt: string; band: Band; score: number; topReason: string | null }[];
  reports: { payeeUpiId: string; reason: string; createdAt: string }[];
}

export interface AlertSummary {
  id: string;
  status: "OPEN" | "REVIEWED";
  outcome: "FRAUD" | "SAFE" | null;
  createdAt: string;
  reviewedAt: string | null;
  analystName: string | null;
  band: Band;
  score: number;
  ruleScore: number;
  mlScore: number | null;
  degraded: boolean;
  blocked: boolean;
  transactionId: string;
  transactionStatus: TxnStatus;
  amount: number;
  payeeUpiId: string;
  userName: string;
  userUpiId: string;
  isSynthetic: boolean;
  topReasons: string[];
}

export interface AlertDetail extends AlertSummary {
  notes: string;
  modelVersion: string | null;
  latencyMs: number;
  preContextScore: number | null;
  contextAnswers: { pressure: boolean; otpOrApp: boolean; knowRecipient: boolean } | null;
  reasons: RenderedReason[];
  mlTopFeatures: { feature: string; value: number; contribution: number }[] | null;
  features: { name: string; value: number; description: string }[];
  user: { id: string; name: string; upiId: string; accountAgeDays: number };
  payee: {
    upiId: string;
    displayName: string | null;
    firstSeenAt: string | null;
    reportCount: number;
    reputationScore: number;
    confirmedFraudAt: string | null;
    history: { id: string; userName: string; amount: number; status: TxnStatus; createdAt: string; band: Band | null; score: number | null }[];
    reports: { reason: string; createdAt: string }[];
  };
}

export interface AlertList extends Page<AlertSummary> {
  openCount: number;
}

/** Payloads pushed on GET /api/alerts/stream (all sent as `event: message`). */
export type AlertStreamEvent =
  | { type: "connected" }
  | { type: "alert"; escalated: boolean; alert: AlertSummary }
  | { type: "alert-reviewed"; alertId: string; outcome: "FRAUD" | "SAFE" };

export type BreakerState = "closed" | "open" | "half-open";

export interface QueueCounts {
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
  completed?: number;
}

export interface WorkerSummary {
  generatedAt: string;
  last24h: { byBand: Partial<Record<Band, number>>; degraded: number; avgDecisionLatencyMs: number | null };
  decisionsLastHour: number;
  openAlerts: number;
}

export interface AdminMetrics {
  decisionsByBand: Record<Band, number>;
  latency: {
    samples: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    histogram: { bucket: string; count: number }[];
  };
  ml: {
    calls: number;
    ok: number;
    fallbacks: number;
    timeouts: number;
    errors: number;
    breakerOpenSkips: number;
    breaker: BreakerState;
  };
  queue: { riskEvents: QueueCounts; model: QueueCounts };
  services: { api: boolean; postgres: boolean; redis: boolean; ml: boolean; mlModelVersion: string | null; worker: boolean };
  liveClients: number;
  summary: WorkerSummary | null;
}

/* ---------- Admin: simulator, rules, model & evaluation ---------- */

export type { RuleCode, RuleConfigEntry, Scenario, Thresholds } from "@scamshield/shared";
import type { RuleConfigEntry, Scenario, Thresholds } from "@scamshield/shared";

export interface MlTopFeature {
  feature: string;
  value: number;
  /** Drop in the model's fraud probability (0-1) when this feature is reset to a typical legitimate value. */
  contribution: number;
}

export interface SimScenario {
  id: Scenario;
  title: string;
  description: string;
}

export interface SimStep {
  step: number;
  actor: string;
  action: string;
  payeeUpiId: string;
  amount: number;
  band: Band;
  score: number;
  ruleScore: number;
  mlScore: number | null;
  preContextScore: number | null;
  degraded: boolean;
  blocked: boolean;
  outcome: "completed" | "stopped" | "rescored";
  reasons: RenderedReason[];
  mlTopFeatures: MlTopFeature[] | null;
  latencyMs: number;
}

export interface SimRun {
  scenario: Scenario;
  title: string;
  description: string;
  steps: SimStep[];
  finalBand: Band | null;
}

export interface RuleView extends RuleConfigEntry {
  defaults: RuleConfigEntry;
  updatedAt: string | null;
}

export interface WhatIfMetrics {
  precision: number;
  recall: number;
  fpr: number;
  flagRate: number;
  bands: Record<Band, number>;
  perScenario: { scenario: string; isFraud: boolean; flaggedRate: number }[];
}

export interface WhatIfResult {
  sampleSize: number;
  note: string;
  current: WhatIfMetrics;
  proposed: WhatIfMetrics;
}

export interface TrainingMetrics {
  version: string;
  trained_at: string;
  algorithm: string;
  train_seconds: number;
  rows: { train: number; calibration: number; test: number; analyst_labels: number };
  fraud_rate: { train: number; calibration: number; test: number };
  split: string;
  holdout: Record<string, { pr_auc: number; roc_auc: number; brier: number }>;
}

export type TrainStatusName = "idle" | "training" | "evaluating" | "completed" | "failed";

export interface TrainStatus {
  status: TrainStatusName;
  startedAt?: number;
  finishedAt?: number;
  version?: string;
  error?: string;
  analystLabels?: number;
}

export interface RetrainJob {
  id: string;
  state: string;
  /** BullMQ progress: 0 until the worker reports, then the latest ML training status. */
  progress: number | { status?: string; analystLabels?: number };
  failedReason?: string;
  timestamp: number;
}

export interface ModelInfo {
  active: { id: string; version: string; trainedAt: string; active: boolean; metrics: { training?: TrainingMetrics } | null } | null;
  servingVersion: string | null;
  liveMetrics: TrainingMetrics | null;
  training: TrainStatus | null;
  history: { id: string; version: string; trainedAt: string; active: boolean }[];
  recentJobs: RetrainJob[];
}

export type SystemKey = "rules_only" | "ml_only" | "hybrid";

export interface ThresholdMetrics {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  fpr: number;
  f1: number;
  flag_rate: number;
}

export interface SystemEvaluation {
  label: string;
  pr_auc: number;
  roc_auc: number;
  at_medium: ThresholdMetrics;
  at_high: ThresholdMetrics;
  pr_curve: { recall: number; precision: number }[];
  sweep: ThresholdMetrics[];
}

export type ScenarioDetection = { scenario: string; is_fraud: boolean; count: number } & Record<SystemKey, number>;

export interface Evaluation {
  version: string;
  holdout: { rows: number; fraud: number; fraud_rate: number; from_ts: number; to_ts: number };
  thresholds: Thresholds;
  systems: Record<SystemKey, SystemEvaluation>;
  matched_fpr: { target_fpr: number; systems: Record<SystemKey, ThresholdMetrics | null> };
  hybrid_beats_rules_on_recall_at_matched_fpr: boolean;
  per_scenario: ScenarioDetection[];
  calibration: { points: { bin: [number, number]; predicted: number; observed: number; count: number }[]; bin_counts: number[] };
  feature_importance: { feature: string; importance: number }[];
  notes: string[];
}
