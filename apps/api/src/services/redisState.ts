import { emptyHistory, type HistoryStats } from "@scamshield/shared";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { keys, SET_SENTINEL, TTL } from "../lib/keys";
import { redis } from "../lib/redis";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface PayeeInfo {
  upiId: string;
  displayName: string | null;
  firstSeenAtMs: number | null;
  reportCount: number;
  confirmedFraud: boolean;
  reputationScore: number;
}

/** Loads a Redis set from Postgres on first use (sentinel marks "loaded, possibly empty"). */
async function ensureSet(key: string, loader: () => Promise<string[]>): Promise<void> {
  if (await redis.exists(key)) return;
  const members = await loader();
  await redis.multi().sadd(key, SET_SENTINEL, ...members).expire(key, TTL.knownSetSeconds).exec();
}

export async function isKnownPayee(userId: string, upi: string): Promise<boolean> {
  const key = keys.knownPayees(userId);
  await ensureSet(key, async () => {
    const rows = await prisma.transaction.findMany({
      where: { userId, status: "COMPLETED" },
      distinct: ["payeeUpiId"],
      select: { payeeUpiId: true },
    });
    return rows.map((r) => r.payeeUpiId);
  });
  return (await redis.sismember(key, upi)) === 1;
}

export async function isKnownDevice(userId: string, hash: string): Promise<boolean> {
  const key = keys.knownDevices(userId);
  await ensureSet(key, async () => {
    const [user, rows] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { deviceHash: true } }),
      prisma.transaction.findMany({
        where: { userId, status: "COMPLETED", deviceHash: { not: null } },
        distinct: ["deviceHash"],
        select: { deviceHash: true },
      }),
    ]);
    return [user?.deviceHash, ...rows.map((r) => r.deviceHash)].filter((d): d is string => !!d);
  });
  return (await redis.sismember(key, hash)) === 1;
}

/** 30-day baseline of completed, non-fraud payments, computed in Postgres (same definitions as the Python generator). */
export async function computeProfile(userId: string): Promise<HistoryStats> {
  const [row] = await prisma.$queryRaw<HistoryStats[]>(Prisma.sql`
    SELECT count(*)::int AS "count",
           coalesce(avg(amount), 0)::float8 AS "mean",
           coalesce(stddev_pop(amount), 0)::float8 AS "std",
           coalesce(max(amount), 0)::float8 AS "max",
           coalesce(sum(sin(2 * pi() * extract(hour FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) / 24)), 0)::float8 AS "hourSin",
           coalesce(sum(cos(2 * pi() * extract(hour FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) / 24)), 0)::float8 AS "hourCos"
    FROM "Transaction"
    WHERE "userId" = ${userId} AND status = 'COMPLETED' AND label <> 'FRAUD'
      AND "createdAt" > now() - interval '30 days'`);
  return row ?? emptyHistory();
}

export async function refreshProfile(userId: string): Promise<HistoryStats> {
  const profile = await computeProfile(userId);
  const key = keys.profile(userId);
  await redis
    .multi()
    .hset(key, { ...profile, updatedAt: Date.now() })
    .expire(key, TTL.profileSeconds)
    .exec();
  return profile;
}

/** Reads the cached baseline; on a cache miss computes it from Postgres and caches it. */
export async function getProfile(userId: string): Promise<HistoryStats> {
  const h = await redis.hgetall(keys.profile(userId));
  if (!h.count) return refreshProfile(userId);
  return {
    count: Number(h.count),
    mean: Number(h.mean),
    std: Number(h.std),
    max: Number(h.max),
    hourSin: Number(h.hourSin),
    hourCos: Number(h.hourCos),
  };
}

export async function velocityCounts(userId: string, upi: string, amount: number, now: number) {
  const [c10, c1h, samePayee] = await Promise.all([
    redis.zcount(keys.velocity(userId), `(${now - 10 * MIN}`, "+inf"),
    redis.zcount(keys.velocity(userId), `(${now - HOUR}`, "+inf"),
    redis.zrangebyscore(keys.velocityPayee(userId, upi), `(${now - HOUR}`, "+inf"),
  ]);
  const sameAmount = samePayee.filter((m) => {
    const a = Number(m.split(":")[1]);
    return Math.abs(a - amount) <= 0.2 * amount;
  }).length;
  return { count10min: c10, count1h: c1h, sameAmount };
}

export async function payeeDistinctSenders(upi: string, userId: string, now: number): Promise<number> {
  const key = keys.payeeSenders(upi);
  const [total, own] = await Promise.all([redis.zcount(key, `(${now - DAY}`, "+inf"), redis.zscore(key, userId)]);
  return total - (own !== null && Number(own) > now - DAY ? 1 : 0);
}

export async function failedAttempts(userId: string, now: number): Promise<number> {
  return redis.zcount(keys.failures(userId), `(${now - 15 * MIN}`, "+inf");
}

/** Failed logins and failed recipient verifications feed the failed_attempts_15min feature. */
export async function recordFailure(userId: string, at = Date.now()): Promise<void> {
  const key = keys.failures(userId);
  await redis.multi().zadd(key, at, `${at}:${randomUUID()}`).expire(key, TTL.failuresSeconds).exec();
}

/** Hot-path state updates after a payment completes; the slower baseline refresh happens in the worker. */
export async function recordCompletedPayment(p: {
  txnId: string;
  userId: string;
  upi: string;
  amount: number;
  deviceHash: string | null;
  at: number;
}): Promise<void> {
  const vel = keys.velocity(p.userId);
  const velPayee = keys.velocityPayee(p.userId, p.upi);
  const senders = keys.payeeSenders(p.upi);
  const m = redis
    .multi()
    .zadd(vel, p.at, p.txnId)
    .zremrangebyscore(vel, "-inf", p.at - HOUR)
    .expire(vel, TTL.velocitySeconds)
    .zadd(velPayee, p.at, `${p.txnId}:${p.amount}`)
    .expire(velPayee, TTL.velocitySeconds)
    .zadd(senders, p.at, p.userId)
    .zremrangebyscore(senders, "-inf", p.at - DAY)
    .expire(senders, TTL.payeeSendersSeconds);
  // Only extend sets that are already loaded; otherwise they are rebuilt from Postgres on next use.
  if (await redis.exists(keys.knownPayees(p.userId))) m.sadd(keys.knownPayees(p.userId), p.upi);
  if (p.deviceHash && (await redis.exists(keys.knownDevices(p.userId)))) m.sadd(keys.knownDevices(p.userId), p.deviceHash);
  await m.exec();
}

export async function getPayeeInfo(upi: string): Promise<PayeeInfo> {
  const key = keys.payeeInfo(upi);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as PayeeInfo;
  const [payee, owner] = await Promise.all([
    prisma.payee.findUnique({ where: { upiId: upi } }),
    prisma.user.findUnique({ where: { upiId: upi }, select: { name: true, createdAt: true } }),
  ]);
  const info: PayeeInfo = {
    upiId: upi,
    displayName: payee?.displayName ?? owner?.name ?? null,
    firstSeenAtMs: payee?.firstSeenAt.getTime() ?? owner?.createdAt.getTime() ?? null,
    reportCount: payee?.reportCount ?? 0,
    confirmedFraud: !!payee?.confirmedFraudAt,
    reputationScore: payee?.reputationScore ?? 0,
  };
  await redis.set(key, JSON.stringify(info), "EX", TTL.payeeInfoSeconds);
  return info;
}

export async function invalidatePayee(upi: string): Promise<void> {
  await redis.del(keys.payeeInfo(upi));
}

/** Used by the simulator to start each scenario from a clean, explainable state. */
export async function resetUserState(userId: string): Promise<void> {
  const velocityKeys = await redis.keys(`vel:${userId}*`);
  await redis.del(keys.failures(userId), keys.profile(userId), keys.knownPayees(userId), keys.knownDevices(userId), ...velocityKeys);
}

