import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db";
import { hashDeviceId } from "../src/lib/device";
import { buildFeatures } from "../src/services/featureBuilder";
import { recordCompletedPayment, recordFailure } from "../src/services/redisState";
import { createPayee, createUser, DEVICE, mlStub, resetState } from "./helpers";

const device = hashDeviceId(DEVICE);

describe("feature builder (Redis + Postgres state)", () => {
  beforeAll(() => mlStub.start());
  afterAll(() => mlStub.stop());
  beforeEach(resetState);

  it("uses the user's history for baseline, known payees and devices", async () => {
    const user = await createUser({ historyTo: ["grocer@test"] });
    await createPayee("grocer@test", { ageDays: 900 });
    const now = Date.now();
    const known = await buildFeatures({ userId: user.id, payeeUpiId: "grocer@test", amount: 400, deviceHash: device, now });
    expect(known.input.history.count).toBe(10);
    expect(known.features).toMatchObject({ is_new_payee_for_user: 0, is_new_device: 0, amount_to_user_max_ratio: expect.any(Number) });
    expect(known.features.payee_age_days).toBeGreaterThan(899);

    const stranger = await buildFeatures({ userId: user.id, payeeUpiId: "stranger@test", amount: 9000, deviceHash: "other", now });
    expect(stranger.features).toMatchObject({ is_new_payee_for_user: 1, is_new_device: 1, payee_age_days: 0 });
    expect(stranger.features.amount_zscore_vs_user_30d).toBeGreaterThan(3);
  });

  it("excludes fraud-labelled payments from the baseline", async () => {
    const user = await createUser({ historyTo: ["grocer2@test"] });
    await prisma.transaction.create({
      data: { userId: user.id, payeeUpiId: "scam@test", amount: 40_000, status: "COMPLETED", label: "FRAUD", createdAt: new Date(Date.now() - 86_400_000) },
    });
    const f = await buildFeatures({ userId: user.id, payeeUpiId: "x@test", amount: 500, deviceHash: device, now: Date.now() });
    expect(f.input.history.count).toBe(10);
    expect(f.input.history.max).toBeLessThan(1000);
  });

  it("counts velocity, similar amounts and failed attempts from Redis windows", async () => {
    const user = await createUser();
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      await recordCompletedPayment({ txnId: `t${i}`, userId: user.id, upi: "shop@test", amount: 1000 + i * 50, deviceHash: device, at: now - (i + 1) * 60_000 });
    }
    await recordCompletedPayment({ txnId: "old", userId: user.id, upi: "shop@test", amount: 1000, deviceHash: device, at: now - 50 * 60_000 });
    for (let i = 0; i < 3; i++) await recordFailure(user.id, now - i * 1000);
    const f = await buildFeatures({ userId: user.id, payeeUpiId: "shop@test", amount: 1000, deviceHash: device, now });
    expect(f.features).toMatchObject({
      user_txn_count_10min: 3,
      user_txn_count_1h: 4,
      same_amount_repeat_count_1h: 4,
      failed_attempts_15min: 3,
    });
  });

  it("counts distinct other senders to a payee in 24 hours", async () => {
    const [a, b, c, me] = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
    const now = Date.now();
    for (const u of [a, b, c, me]) await recordCompletedPayment({ txnId: u.id, userId: u.id, upi: "mule@test", amount: 499, deviceHash: device, at: now - 3600_000 });
    await recordCompletedPayment({ txnId: "a2", userId: a.id, upi: "mule@test", amount: 499, deviceHash: device, at: now - 60_000 });
    const f = await buildFeatures({ userId: me.id, payeeUpiId: "mule@test", amount: 499, deviceHash: device, now });
    expect(f.features.payee_distinct_senders_24h).toBe(3);
  });
});
