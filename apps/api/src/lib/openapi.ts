import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  alertsQuerySchema,
  cancelRequestSchema,
  checkRequestSchema,
  confirmRequestSchema,
  contextRequestSchema,
  loginSchema,
  registerSchema,
  reportPayeeSchema,
  reviewAlertSchema,
  rulesUpdateSchema,
  thresholdsSchema,
  transactionsQuerySchema,
  whatIfSchema,
  z,
} from "@scamshield/shared";
import type { AnyZodObject, ZodTypeAny } from "zod";

// Patch the Zod instance the shared schemas were created with (prototype patch, so existing schemas gain .openapi()).
extendZodWithOpenApi(z);

type Method = "get" | "post" | "put";

interface Route {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  body?: ZodTypeAny;
  query?: AnyZodObject;
  auth?: boolean;
  headers?: AnyZodObject;
}

const id = z.object({ id: z.string().uuid() });

const ROUTES: Route[] = [
  { method: "post", path: "/api/auth/register", tag: "Auth", summary: "Create a wallet account (sets the session cookie)", body: registerSchema, auth: false },
  { method: "post", path: "/api/auth/login", tag: "Auth", summary: "Sign in (sets httpOnly cookie, also returns a bearer token)", body: loginSchema, auth: false },
  { method: "post", path: "/api/auth/logout", tag: "Auth", summary: "Sign out", auth: false },
  { method: "get", path: "/api/auth/me", tag: "Auth", summary: "Current user" },
  { method: "get", path: "/api/wallet", tag: "Wallet", summary: "Balance, 30-day spending and warning counts" },
  { method: "get", path: "/api/transactions", tag: "Wallet", summary: "Own transactions with risk bands", query: transactionsQuerySchema },
  { method: "get", path: "/api/safety", tag: "Wallet", summary: "Warnings received and payees reported" },
  { method: "get", path: "/api/payees/lookup", tag: "Payees", summary: "Recipient info before paying", query: z.object({ upi: z.string() }) },
  { method: "post", path: "/api/payees/report", tag: "Payees", summary: "Report a recipient as a suspected scam", body: reportPayeeSchema },
  {
    method: "post",
    path: "/api/payments/check",
    tag: "Payments",
    summary: "Phase 1: risk-check a payment (idempotent). Returns score, band, reasons and a short-lived checkToken",
    body: checkRequestSchema,
    headers: z.object({ "Idempotency-Key": z.string().optional(), "X-Device-Id": z.string().optional() }),
  },
  { method: "post", path: "/api/payments/{id}/context", tag: "Payments", summary: "Answer the scam-context questionnaire and re-score", body: contextRequestSchema },
  { method: "post", path: "/api/payments/confirm", tag: "Payments", summary: "Phase 2: move the money (HIGH needs cooldown + retyped UPI ID)", body: confirmRequestSchema },
  { method: "post", path: "/api/payments/{id}/cancel", tag: "Payments", summary: "Cancel a pending payment, optionally reporting the recipient", body: cancelRequestSchema },
  { method: "get", path: "/api/alerts", tag: "Analyst", summary: "Alert queue", query: alertsQuerySchema },
  { method: "get", path: "/api/alerts/stream", tag: "Analyst", summary: "Live alerts (Server-Sent Events)" },
  { method: "get", path: "/api/alerts/{id}", tag: "Analyst", summary: "Alert detail: features, reasons, payee history" },
  { method: "post", path: "/api/alerts/{id}/review", tag: "Analyst", summary: "Label an alert FRAUD or SAFE", body: reviewAlertSchema },
  { method: "get", path: "/api/admin/rules", tag: "Admin", summary: "Rule configuration" },
  { method: "put", path: "/api/admin/rules", tag: "Admin", summary: "Update rules (enabled, weight, params)", body: rulesUpdateSchema },
  { method: "post", path: "/api/admin/rules/what-if", tag: "Admin", summary: "Preview a configuration on the labelled holdout sample", body: whatIfSchema },
  { method: "get", path: "/api/admin/thresholds", tag: "Admin", summary: "Blend weights and band thresholds" },
  { method: "put", path: "/api/admin/thresholds", tag: "Admin", summary: "Update blend weights and band thresholds", body: thresholdsSchema },
  { method: "get", path: "/api/admin/model", tag: "Admin", summary: "Active model, history and training status" },
  { method: "post", path: "/api/admin/model/retrain", tag: "Admin", summary: "Queue retraining (synthetic data + analyst labels)" },
  { method: "get", path: "/api/admin/metrics", tag: "Admin", summary: "Decision counts, latency, ML fallbacks, queue depth, service status" },
  { method: "get", path: "/api/admin/evaluation", tag: "Admin", summary: "Rules vs ML vs hybrid on the time-based holdout" },
  { method: "get", path: "/api/admin/simulate", tag: "Admin", summary: "List simulator scenarios" },
  { method: "post", path: "/api/admin/simulate/{scenario}", tag: "Admin", summary: "Run a scam scenario through the real pipeline" },
];

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "cookieAuth", { type: "apiKey", in: "cookie", name: "ss_session" });
  registry.registerComponent("securitySchemes", "bearerAuth", { type: "http", scheme: "bearer" });
  for (const r of ROUTES) {
    const params = r.path.match(/\{(\w+)\}/g)?.map((p) => p.slice(1, -1)) ?? [];
    registry.registerPath({
      method: r.method,
      path: r.path,
      tags: [r.tag],
      summary: r.summary,
      security: r.auth === false ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      request: {
        ...(r.body && { body: { content: { "application/json": { schema: r.body } } } }),
        ...(r.query && { query: r.query }),
        ...(r.headers && { headers: r.headers }),
        ...(params.length && { params: params.includes("id") ? id : z.object({ scenario: z.enum(["normal", "impersonation", "mule", "velocity", "takeover"]) }) }),
      },
      responses: {
        200: { description: "Success" },
        400: { description: "Validation error" },
        401: { description: "Not signed in" },
        403: { description: "Forbidden for this role" },
      },
    });
  }
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "ScamShield API",
      version: "1.0.0",
      description: "Pre-transaction scam detection for a UPI-style wallet. Synthetic demo system, not a real bank.",
    },
    servers: [{ url: "/" }],
  });
}
