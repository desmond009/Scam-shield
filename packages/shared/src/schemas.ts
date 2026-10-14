import { z } from "zod";
import { RULE_CODES } from "./rules";

export const ROLES = ["USER", "ANALYST", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const BANDS = ["LOW", "MEDIUM", "HIGH"] as const;
export const TXN_STATUSES = ["PENDING", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export type TxnStatus = (typeof TXN_STATUSES)[number];

/** UPI daily per-transaction limit used for validation (synthetic wallet). */
export const MAX_PAYMENT_AMOUNT = 100_000;
export const HIGH_RISK_COOLDOWN_SECONDS = 10;

export const upiIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{2,64}@[a-z]{2,32}$/, "Enter a valid UPI ID, like name@bank");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const checkRequestSchema = z.object({
  payeeUpiId: upiIdSchema,
  amount: z.number().positive().max(MAX_PAYMENT_AMOUNT).multipleOf(0.01),
  note: z.string().trim().max(80).optional(),
});

export const contextRequestSchema = z.object({
  pressure: z.boolean(),
  otpOrApp: z.boolean(),
  knowRecipient: z.boolean(),
});

export const confirmRequestSchema = z.object({
  checkToken: z.string().min(10).max(2048),
  retypedUpiId: z.string().trim().toLowerCase().max(100).optional(),
});

export const cancelRequestSchema = z.object({
  report: z.boolean().default(false),
  reason: z.string().trim().max(200).optional(),
});

export const reportPayeeSchema = z.object({
  payeeUpiId: upiIdSchema,
  reason: z.string().trim().min(3).max(200),
});

export const reviewAlertSchema = z.object({
  outcome: z.enum(["FRAUD", "SAFE"]),
  notes: z.string().trim().max(500).default(""),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const transactionsQuerySchema = paginationSchema.extend({
  status: z.enum(TXN_STATUSES).optional(),
  band: z.enum(BANDS).optional(),
});

export const alertsQuerySchema = paginationSchema.extend({
  status: z.enum(["OPEN", "REVIEWED"]).optional(),
  band: z.enum(BANDS).optional(),
});

export const thresholdsSchema = z
  .object({
    ruleWeight: z.number().min(0).max(1),
    mlWeight: z.number().min(0).max(1),
    mediumThreshold: z.number().min(1).max(99),
    highThreshold: z.number().min(2).max(100),
  })
  .refine((t) => t.mediumThreshold < t.highThreshold, { message: "mediumThreshold must be below highThreshold" })
  .refine((t) => Math.abs(t.ruleWeight + t.mlWeight - 1) < 1e-6, { message: "ruleWeight + mlWeight must equal 1" });

export const ruleUpdateSchema = z.object({
  code: z.enum(RULE_CODES),
  enabled: z.boolean(),
  weight: z.number().min(0).max(3),
  params: z.record(z.string(), z.number().min(0).max(10_000)),
});

export const rulesUpdateSchema = z.object({ rules: z.array(ruleUpdateSchema).min(1) });

export const whatIfSchema = z.object({
  rules: z.array(ruleUpdateSchema).optional(),
  thresholds: thresholdsSchema.optional(),
});

export const SCENARIOS = ["normal", "impersonation", "mule", "velocity", "takeover"] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const scenarioSchema = z.enum(SCENARIOS);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type ContextRequest = z.infer<typeof contextRequestSchema>;
export type ConfirmRequest = z.infer<typeof confirmRequestSchema>;
export type ReviewAlertInput = z.infer<typeof reviewAlertSchema>;
export type RuleUpdate = z.infer<typeof ruleUpdateSchema>;
