# Load test results

**Target:** `POST /api/payments/check` p95 < 300 ms end-to-end, locally.

**How to run:** `make demo` and then `make loadtest`, or `node scripts/loadtest.mjs --rate 20 --duration 60`.

The script uses autocannon. Checks are rate limited to 120 per minute per user, so it spreads requests round-robin over the 12 seeded simulator accounts. Each request is a normal payment, so it runs the full pipeline:
1. features from Redis and Postgres
2. rules
3. the ML call
4. the decision insert
5. the job enqueue

## Environment

- Docker Desktop on a MacBook Air (Apple silicon, 10 cores). All six containers run on the same machine.
- One API container, one worker and one ML process (uvicorn, 1 worker, `OMP_NUM_THREADS=1`).

## Results (2026-10-14)

| Run | Requests | Rate | Errors / non-2xx | ML fallbacks | p50 | p90 | p97.5 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| Hybrid path, ML healthy | 1,200 | 20/s for 60 s, 10 connections | 0 / 0 | 0 | 42 ms | 87 ms | 106 ms | 118 ms | 147 ms |

These figures are client-side, measured by autocannon. The API's own metrics for the same run were p50 77 ms, p95 109 ms and p99 128 ms (System Health page, last 2,000 checks).

**Result: p95 is about 110 ms, well within the 300 ms budget.**

## What we learned

The first run showed the ML service as the bottleneck.

- **Default build:** `/score` reached only about 47 requests per second at 10 concurrent connections, with p50 205 ms. scikit-learn's OpenMP thread pool costs more to start than a single-row prediction takes.
- **Effect on the API:** under load, ML calls went past the 150 ms timeout, the circuit breaker opened, and most decisions were scored by the rules only, marked `degraded: true`. Payments kept working, which is the intended fallback, but these were not hybrid decisions.
- **Fix:** setting `OMP_NUM_THREADS=1` in the ML image raised `/score` throughput to about 154 requests per second, with p50 61 ms and p99 161 ms at concurrency 10. After that, the breaker stayed closed for the whole run.

## Numbers for the ML service alone

| Setting | Throughput (10 connections) | p50 | p99 |
|---|---|---|---|
| Default OpenMP threads | 47 req/s | 205 ms | 295 ms |
| `OMP_NUM_THREADS=1` | 154 req/s | 61 ms | 161 ms |

Scoring one request sequentially takes under 10 ms, including the per-feature explanation (21 predictions in one batch). The pytest suite asserts that p95 is under 50 ms.

## Caveats

- **Rate:** the 20 requests per second comes from the per-user rate limit and 12 test accounts, not from a measured maximum of the API.
- **Higher throughput:** add more API and ML replicas. Both are stateless; see ARCHITECTURE.md §10.
- **Hardware:** this was measured on a laptop with everything co-located. It is not a production benchmark.
