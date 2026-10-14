import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aggregateMetrics, handleDecision, updatePayeeReputation } from "../src/jobs/riskJobs";
import { prisma } from "../src/lib/db";
import { keys } from "../src/lib/keys";
import { newRedisConnection, redis } from "../src/lib/redis";
import { recordCompletedPayment } from "../src/services/redisState";
import { authed, createPayee, createUser, mlStub, resetState, tokenFor } from "./helpers";

describe("worker jobs", () => {
  beforeAll(() => mlStub.start());
  afterAll(() => mlStub.stop());
  beforeEach(resetState);

  it("turns a risky decision into one alert and publishes a live event; LOW creates none", async () => {
    const user = await createUser({ historyTo: ["grocer@test"] });
    const api = authed(await tokenFor(user.email));
    const sub = newRedisConnection();
    const events: string[] = [];
    await sub.subscribe(keys.eventsChannel);
    sub.on("message", (_c, m) => events.push(m));

    mlStub.score = 80;
    const risky = await api.post("/api/payments/check").send({ payeeUpiId: "stranger@test", amount: 5000 });
    await handleDecision(risky.body.decisionId);
    await handleDecision(risky.body.decisionId); // retries are idempotent
    expect(await prisma.alert.count({ where: { decisionId: risky.body.decisionId } })).toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(events.map((e) => JSON.parse(e))).toContainEqual(expect.objectContaining({ type: "alert", escalated: false }));

    mlStub.score = 1;
    await createPayee("grocer@test", { ageDays: 900 });
    const safe = await api.post("/api/payments/check").send({ payeeUpiId: "grocer@test", amount: 300 });
    expect(safe.body.band).toBe("LOW");
    await handleDecision(safe.body.decisionId);
    expect(await prisma.alert.count({ where: { decisionId: safe.body.decisionId } })).toBe(0);
    await sub.quit();
  });

  it("scores payee reputation from reports, confirmed fraud and the mule pattern", async () => {
    await createPayee("rep.mule@test", { ageDays: 3, reportCount: 2 });
    const senders = await Promise.all([1, 2, 3, 4, 5].map(() => createUser()));
    for (const s of senders) await recordCompletedPayment({ txnId: s.id, userId: s.id, upi: "rep.mule@test", amount: 499, deviceHash: null, at: Date.now() });
    await updatePayeeReputation("rep.mule@test");
    expect((await prisma.payee.findUniqueOrThrow({ where: { upiId: "rep.mule@test" } })).reputationScore).toBe(2 * 15 + 25);
  });

  it("writes the metrics roll-up that doubles as the worker heartbeat", async () => {
    const summary = await aggregateMetrics();
    expect(summary).toHaveProperty("last24h.byBand");
    expect(await redis.ttl(keys.metricsSummary)).toBeGreaterThan(0);
  });
});
