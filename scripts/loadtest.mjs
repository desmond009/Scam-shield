#!/usr/bin/env node
/**
 * Load test for POST /api/payments/check (the hot path) with autocannon.
 *
 * The check endpoint is rate limited to RATE_LIMIT_CHECK_PER_MIN (default 120) per user, so requests are spread
 * round-robin over the 12 seeded simulator accounts. Each request is an ordinary payment to a payee the user knows,
 * so it exercises the full pipeline (features from Redis/Postgres, rules, ML call, decision write, job enqueue).
 *
 * Usage: node scripts/loadtest.mjs [--url http://localhost:4000] [--rate 20] [--duration 60] [--connections 10]
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const autocannon = require("autocannon");

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean).map((a) => a.trim().split(/\s+/)));
const URL_ = args.url ?? "http://localhost:4000";
const RATE = Number(args.rate ?? 20);
const DURATION = Number(args.duration ?? 60);
const CONNECTIONS = Number(args.connections ?? 10);
const USERS = ["arjun", "karan", "priya", "meera", ...Array.from({ length: 8 }, (_, i) => `victim${i + 1}`)];

async function login(key) {
  const res = await fetch(`${URL_}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${key}@sim.scamshield.in`, password: "Demo@1234" }),
  });
  if (!res.ok) throw new Error(`login ${key} failed: ${res.status}`);
  return { token: (await res.json()).token, device: `demo-phone-${key}` };
}

const sessions = await Promise.all(USERS.map(login));
let i = 0;
console.log(`Load testing ${URL_}/api/payments/check at ${RATE} req/s for ${DURATION}s with ${CONNECTIONS} connections, ${sessions.length} users`);

const result = await autocannon({
  url: `${URL_}/api/payments/check`,
  connections: CONNECTIONS,
  overallRate: RATE,
  duration: DURATION,
  requests: [
    {
      method: "POST",
      setupRequest: (req) => {
        const s = sessions[i++ % sessions.length];
        return {
          ...req,
          headers: { "content-type": "application/json", authorization: `Bearer ${s.token}`, "x-device-id": s.device },
          body: JSON.stringify({ payeeUpiId: "metro.pharmacy@oksbi", amount: 200 + (i % 100) }),
        };
      },
    },
  ],
});

const l = result.latency;
const summary = {
  requests: result.requests.total,
  throughputPerSec: result.requests.average,
  non2xx: result.non2xx,
  errors: result.errors,
  timeouts: result.timeouts,
  latencyMs: { p50: l.p50, p90: l.p90, p97_5: l.p97_5, p99: l.p99, max: l.max, mean: l.mean },
};
console.log(JSON.stringify(summary, null, 2));
console.log(l.p99 < 300 && result.non2xx === 0 ? "PASS: p99 < 300 ms with no errors" : "CHECK: see numbers above");
