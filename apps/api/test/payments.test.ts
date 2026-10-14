import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db";
import { keys } from "../src/lib/keys";
import { redis } from "../src/lib/redis";
import { failedAttempts } from "../src/services/redisState";
import { authed, createPayee, createUser, mlStub, resetState, tokenFor } from "./helpers";

async function setup(balance = 50_000) {
  const user = await createUser({ historyTo: ["grocer@test"], balance });
  return { user, api: authed(await tokenFor(user.email)) };
}

const check = (api: ReturnType<typeof authed>, payeeUpiId: string, amount: number, key?: string) => {
  const req = api.post("/api/payments/check");
  if (key) req.set("Idempotency-Key", key);
  return req.send({ payeeUpiId, amount });
};

describe("two-phase payments", () => {
  beforeAll(async () => {
    await mlStub.start();
    await createPayee("grocer@test", { ageDays: 900 });
  });
  afterAll(() => mlStub.stop());
  beforeEach(resetState);

  it("lets a normal payment through and moves money atomically with a ledger entry", async () => {
    const { user, api } = await setup();
    const res = await check(api, "grocer@test", 400);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ band: "LOW", degraded: false, requiresContext: false, requiresVerification: false, mlScore: 5 });
    const confirm = await api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ status: "COMPLETED", balance: 49_600 });
    const ledger = await prisma.ledgerEntry.findMany({ where: { transactionId: res.body.transactionId } });
    expect(ledger.map((l) => Number(l.amount))).toEqual([-400]);
    expect(await redis.zscore(keys.payeeSenders("grocer@test"), user.id)).not.toBeNull();
  });

  it("credits the recipient when the payee is a platform user", async () => {
    const { api } = await setup();
    const friend = await createUser({ balance: 1000 });
    const res = await check(api, friend.upiId, 250);
    await api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken }).expect(200);
    expect(Number((await prisma.user.findUniqueOrThrow({ where: { id: friend.id } })).balance)).toBe(1250);
  });

  it("is idempotent: same key replays, a different body is rejected, one row is created", async () => {
    const { user, api } = await setup();
    const a = await check(api, "grocer@test", 300, "key-12345678");
    const b = await check(api, "grocer@test", 300, "key-12345678");
    expect(b.status).toBe(200);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.body.transactionId).toBe(a.body.transactionId);
    expect((await check(api, "grocer@test", 301, "key-12345678")).status).toBe(422);
    expect(await prisma.transaction.count({ where: { userId: user.id, idempotencyKey: "key-12345678" } })).toBe(1);
  });

  it("prevents double spending under concurrent confirms", async () => {
    const { user, api } = await setup(1000);
    const res = await check(api, "grocer@test", 600);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(Number((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance)).toBe(400);
  });

  it("rejects tampered or foreign check tokens", async () => {
    const { api } = await setup();
    const res = await check(api, "grocer@test", 300);
    const forged = jwt.sign({ ...(jwt.decode(res.body.checkToken) as object), amt: 1 }, "wrong-secret-wrong-secret-wrong-secret");
    expect((await api.post("/api/payments/confirm").send({ checkToken: forged })).status).toBe(401);
    const other = await setup();
    expect((await other.api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken })).status).toBe(403);
  });

  it("rejects payments above the balance", async () => {
    const { api } = await setup(100);
    const res = await check(api, "grocer@test", 500);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Insufficient balance/);
  });

  it("HIGH risk requires the cooldown and the retyped recipient", async () => {
    mlStub.score = 95;
    const { user, api } = await setup();
    await createPayee("kyc.desk@test", { ageDays: 1 });
    const res = await check(api, "kyc.desk@test", 9_000);
    expect(res.body).toMatchObject({ band: "HIGH", requiresVerification: true, requiresContext: true, cooldownSeconds: 10 });
    expect(res.body.reasons.length).toBeLessThanOrEqual(3);
    expect(res.body.summary).toMatch(/strong signs of a scam/);

    const early = await api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken, retypedUpiId: "kyc.desk@test" });
    expect(early.status).toBe(425);

    await prisma.riskDecision.update({ where: { id: res.body.decisionId }, data: { updatedAt: new Date(Date.now() - 11_000) } });
    const wrong = await api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken, retypedUpiId: "kyc.desc@test" });
    expect(wrong.status).toBe(422);
    expect(await failedAttempts(user.id, Date.now())).toBe(1);
    const ok = await api.post("/api/payments/confirm").send({ checkToken: res.body.checkToken, retypedUpiId: " KYC.DESK@test " });
    expect(ok.status).toBe(200);
  });

  it("questionnaire answers re-score the payment and can only raise the score", async () => {
    mlStub.score = 60;
    const { api } = await setup();
    const res = await check(api, "unknown.person@test", 3_000);
    expect(res.body.band).toBe("MEDIUM");
    expect(res.body.requiresContext).toBe(true);
    mlStub.score = 1; // even if the model disagrees, answers cannot lower the score
    const ctx = await api.post(`/api/payments/${res.body.transactionId}/context`).send({ pressure: false, otpOrApp: false, knowRecipient: true });
    expect(ctx.status).toBe(200);
    expect(ctx.body.score).toBe(res.body.score);
    expect(ctx.body).toMatchObject({ contextAnswered: true, requiresContext: false, preContextScore: res.body.score });
    expect((await api.post(`/api/payments/${res.body.transactionId}/context`).send({ pressure: true, otpOrApp: true, knowRecipient: false })).status).toBe(409);

    const second = await check(api, "unknown.person2@test", 3_000);
    const otp = await api.post(`/api/payments/${second.body.transactionId}/context`).send({ pressure: true, otpOrApp: true, knowRecipient: false });
    expect(otp.body.band).toBe("HIGH");
    expect(otp.body.reasons.map((r: { code: string }) => r.code)).toContain("OTP_REQUESTED");
  });

  it("blocks payments to analyst-confirmed scam payees", async () => {
    const { api } = await setup();
    await createPayee("confirmed.scam@test", { ageDays: 10, confirmedFraud: true });
    const res = await check(api, "confirmed.scam@test", 500);
    expect(res.body).toMatchObject({ band: "HIGH", blocked: true, status: "BLOCKED" });
    expect(res.body.checkToken).toBeUndefined();
    expect(res.body.reasons[0].code).toBe("CONFIRMED_FRAUD_PAYEE");
  });

  it("cancel and report raises the payee's report count once per user", async () => {
    const { api } = await setup();
    const res = await check(api, "shady@test", 700);
    const cancel = await api.post(`/api/payments/${res.body.transactionId}/cancel`).send({ report: true, reason: "Fake seller" });
    expect(cancel.body).toMatchObject({ status: "CANCELLED", reported: true });
    const again = await api.post("/api/payees/report").send({ payeeUpiId: "shady@test", reason: "Again" });
    expect(again.body.alreadyReported).toBe(true);
    expect((await prisma.payee.findUniqueOrThrow({ where: { upiId: "shady@test" } })).reportCount).toBe(1);
    const lookup = await api.get("/api/payees/lookup?upi=shady@test");
    expect(lookup.body).toMatchObject({ reportCount: 1, paidBefore: false });
  });
});

describe("resilience: ML fallback and circuit breaker", () => {
  beforeAll(() => mlStub.start());
  afterAll(() => mlStub.stop());
  beforeEach(resetState);

  it("falls back to rules-only (degraded) when the ML service errors", async () => {
    mlStub.status = 500;
    const { api } = await setup();
    const res = await check(api, "grocer@test", 400);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ degraded: true, mlScore: null, band: "LOW" });
  });

  it("times out slow ML calls within the budget", async () => {
    mlStub.delayMs = 400;
    const { api } = await setup();
    const started = Date.now();
    const res = await check(api, "grocer@test", 400);
    expect(res.body.degraded).toBe(true);
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("opens the breaker after 5 failures, skips ML while open, and closes after a successful probe", async () => {
    mlStub.status = 500;
    const { api } = await setup();
    for (let i = 0; i < 5; i++) await check(api, "grocer@test", 100 + i);
    expect(await redis.exists(keys.breakerOpen)).toBe(1);
    const hits = mlStub.hits;
    const skipped = await check(api, "grocer@test", 120);
    expect(skipped.body.degraded).toBe(true);
    expect(mlStub.hits).toBe(hits);

    mlStub.status = 200;
    await redis.del(keys.breakerOpen); // the open period elapsed -> half-open
    const probe = await check(api, "grocer@test", 130);
    expect(probe.body.degraded).toBe(false);
    expect(await redis.exists(keys.breakerTripped)).toBe(0);
  });
});
