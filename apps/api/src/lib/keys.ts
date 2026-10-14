/** Central Redis key naming. TTLs are documented in docs/ARCHITECTURE.md (Redis section). */
export const keys = {
  velocity: (userId: string) => `vel:${userId}`,
  velocityPayee: (userId: string, upi: string) => `vel:${userId}:${upi}`,
  payeeSenders: (upi: string) => `payee:${upi}:senders`,
  payeeInfo: (upi: string) => `payee:${upi}:info`,
  knownPayees: (userId: string) => `user:${userId}:payees`,
  knownDevices: (userId: string) => `user:${userId}:devices`,
  profile: (userId: string) => `user:${userId}:profile`,
  failures: (userId: string) => `fail:${userId}`,
  idempotency: (userId: string, key: string) => `idem:${userId}:${key}`,
  rateLimit: "rl:",
  breakerOpen: "cb:ml:open",
  breakerFailures: "cb:ml:failures",
  breakerProbe: "cb:ml:probe",
  breakerTripped: "cb:ml:tripped",
  metricsDecisions: "metrics:decisions",
  metricsLatency: "metrics:latency",
  metricsLatencySamples: "metrics:latency:samples",
  metricsMl: "metrics:ml",
  metricsSummary: "metrics:summary",
  holdoutSample: "cache:holdout-sample",
  eventsChannel: "scamshield:events",
} as const;

export const TTL = {
  velocitySeconds: 2 * 3600,
  payeeSendersSeconds: 25 * 3600,
  payeeInfoSeconds: 600,
  knownSetSeconds: 7 * 86400,
  profileSeconds: 86400,
  failuresSeconds: 20 * 60,
  idempotencySeconds: 86400,
  breakerOpenSeconds: 15,
  breakerFailureWindowSeconds: 30,
  breakerTrippedSeconds: 3600,
  holdoutSampleSeconds: 3600,
} as const;

/** Marker member so an initialised-but-empty Redis set can be told apart from a missing one. */
export const SET_SENTINEL = "__init__";
