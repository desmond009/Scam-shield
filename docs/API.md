# ScamShield API

The full interactive reference (OpenAPI 3) is served at **http://localhost:4000/docs**, and the raw document at
`/openapi.json`.

**Base URL.** The API listens on `http://localhost:4000`. The web app calls it through Next.js on
`http://localhost:3000/api/*`, so the browser stays on the same origin.

**Authentication.** Logging in sets an httpOnly cookie, `ss_session`. The login response also returns `token`, which
non-browser clients can send as `Authorization: Bearer <token>`.

**Errors.** Every error uses this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": {} } }
```

**Common headers on payment calls:**

- `X-Device-Id`: any stable client id. The server stores only a hash of it.
- `Idempotency-Key`: 8-100 characters (letters, digits, `-`, `_`). Accepted on `check`.

## Endpoints

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create a wallet: name, email, password of 8+ characters. Starts with ₹25,000 of demo money. |
| POST | `/api/auth/login` | public | Sign in. Rate limited to 20/min per IP. Wrong passwords count towards `failed_attempts_15min`. |
| POST | `/api/auth/logout` | public | Clear the session cookie. |
| GET | `/api/auth/me` | user | Current user. |
| GET | `/api/wallet` | user | Balance, 30-day spending by day, and the number of warnings. |
| GET | `/api/transactions` | user | Your transactions with risk band. Query: `page`, `pageSize`, `status`, `band`. |
| GET | `/api/safety` | user | Warnings you received and payees you reported. |
| GET | `/api/payees/lookup?upi=` | user | Display name, age on the platform, report count, confirmed-fraud flag, and whether you have paid them before. |
| POST | `/api/payees/report` | user | Report a payee: `{payeeUpiId, reason}`. Counted once per user per payee. |
| POST | `/api/payments/check` | user | **Phase 1.** Scores a payment. Rate limited to 120/min per user. Idempotent. |
| POST | `/api/payments/:id/context` | user | Questionnaire answers `{pressure, otpOrApp, knowRecipient}`. The payment is re-scored. Can be answered once. |
| POST | `/api/payments/confirm` | user | **Phase 2.** `{checkToken, retypedUpiId?}` moves the money. |
| POST | `/api/payments/:id/cancel` | user | `{report?, reason?}` cancels the payment and optionally reports the payee. |
| GET | `/api/alerts` | analyst | Alert queue. Query: `status`, `band`, `page`, `pageSize`. |
| GET | `/api/alerts/stream` | analyst | Server-Sent Events: `{type:"alert", escalated, alert}` and `{type:"alert-reviewed", alertId, outcome}`. |
| GET | `/api/alerts/:id` | analyst | Features, all reasons, ML contributions and the payee's history. |
| POST | `/api/alerts/:id/review` | analyst | `{outcome:"FRAUD"\|"SAFE", notes}`. FRAUD marks the payee as confirmed fraud. |
| GET/PUT | `/api/admin/rules` | admin | Rule configuration: `{rules:[{code, enabled, weight, params}]}`. |
| POST | `/api/admin/rules/what-if` | admin | Preview a draft configuration on the labelled holdout sample. |
| GET/PUT | `/api/admin/thresholds` | admin | `{ruleWeight, mlWeight, mediumThreshold, highThreshold}`. The two weights must sum to 1. |
| GET | `/api/admin/model` | admin | Active model, history, live training status and recent retrain jobs. |
| POST | `/api/admin/model/retrain` | admin | Queues retraining on synthetic data plus analyst labels. Returns `202 {jobId}`. |
| GET | `/api/admin/metrics` | admin | Decisions per band, latency histogram and percentiles, ML outcomes and breaker state, queues, service status. |
| GET | `/api/admin/evaluation` | admin | Rules vs ML vs hybrid on the holdout. |
| GET | `/api/admin/simulate` | admin | List of scenarios. |
| POST | `/api/admin/simulate/:scenario` | admin | Runs `normal`, `impersonation`, `mule`, `velocity` or `takeover` through the real pipeline. |
| GET | `/health`, `/ready` | public | Liveness, and readiness (checks Postgres and Redis). |

## Example: check, then confirm

```http
POST /api/payments/check
Idempotency-Key: 4f1c2b8e-7d1a-4c55-9a0e-2b6d1f3c9a77
X-Device-Id: demo-phone-asha
Content-Type: application/json

{ "payeeUpiId": "kyc.update.desk@ybl", "amount": 2999 }
```

```json
{
  "transactionId": "…", "decisionId": "…", "status": "PENDING",
  "payeeUpiId": "kyc.update.desk@ybl", "amount": 2999,
  "score": 55, "band": "MEDIUM", "blocked": false, "degraded": false,
  "summary": "This payment looks unusual. The recipient is new to you and it resembles patterns seen in past scams.",
  "reasons": [
    { "code": "NEW_PAYEE", "title": "New recipient", "message": "You have never paid this recipient before.", "detail": "No prior completed payment from this user to the payee.", "points": 15 },
    { "code": "ML_PATTERN", "title": "Matches known scam patterns", "message": "This payment resembles patterns seen in past scams.", "detail": "ML model score 82/100.", "points": 49 }
  ],
  "ruleScore": 15, "mlScore": 81.67, "preContextScore": null, "modelVersion": "gbm-…", "latencyMs": 9.4,
  "contextAnswered": false, "requiresContext": true, "requiresVerification": false,
  "cooldownSeconds": 0, "cooldownEndsAt": null,
  "checkToken": "eyJhbGciOiJIUzI1NiIs…",
  "thresholds": { "medium": 35, "high": 70 }
}
```

```http
POST /api/payments/confirm
{ "checkToken": "eyJhbGciOiJIUzI1NiIs…" }
```

For a HIGH decision, also send `"retypedUpiId": "kyc.update.desk@ybl"` once `cooldownEndsAt` has passed.

### Status codes on confirm

| Code | Meaning |
|---|---|
| `200` | Completed. The response includes the new balance. |
| `401 INVALID_CHECK_TOKEN` | The token has expired or was tampered with. |
| `403 PAYMENT_BLOCKED` | The payee is a confirmed scam account. |
| `409` | The payment was already processed (double tap or replay). |
| `422 VERIFICATION_FAILED` | The retyped UPI ID did not match. This counts as a failed attempt. |
| `425 COOLDOWN_ACTIVE` | The safety pause is still running. `details.cooldownEndsAt` says when it ends. |
| `400` | Insufficient balance. |

## ML service (internal, port 8000)

| Method | Path | Purpose |
|---|---|---|
| POST | `/score` | `{features:{…20 named features…}}` returns `{probability, score, modelVersion, topFeatures, latencyMs}`. Unknown or missing features are rejected with `422`. |
| GET | `/health` | Liveness and the loaded model version. |
| GET | `/model` | Active model version and training metrics. |
| GET | `/evaluation` | The evaluation JSON shown on the Model page. |
| GET | `/holdout-sample` | Labelled sample used by the what-if preview. |
| POST | `/reload` | Reloads the active model from disk. |
| POST | `/train` | Starts retraining in the background with `{labels:[{features, label}]}`. |
| GET | `/train/status` | Progress of the current training run. |
