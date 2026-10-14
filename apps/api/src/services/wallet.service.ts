import { renderReason, type Band, type Reason, type TxnStatus } from "@scamshield/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { notFound } from "../lib/errors";
import { getPayeeInfo, isKnownPayee } from "./redisState";

const DAY = 86_400_000;

export async function getWallet(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  const since = new Date(Date.now() - 30 * DAY);
  const [daily, warnings, completed] = await Promise.all([
    prisma.$queryRaw<{ day: string; total: number; count: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
             sum(amount)::float8 AS total, count(*)::int AS count
      FROM "Transaction"
      WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`),
    prisma.riskDecision.count({ where: { band: { in: ["MEDIUM", "HIGH"] }, transaction: { userId }, createdAt: { gte: since } } }),
    prisma.transaction.aggregate({ where: { userId, status: "COMPLETED", createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
  ]);
  return {
    name: user.name,
    upiId: user.upiId,
    balance: Number(user.balance),
    last30Days: { spent: Number(completed._sum.amount ?? 0), payments: completed._count, warnings },
    dailySpending: daily,
  };
}

export async function listTransactions(userId: string, q: { page: number; pageSize: number; status?: TxnStatus; band?: Band }) {
  const where: Prisma.TransactionWhereInput = {
    userId,
    ...(q.status && { status: q.status }),
    ...(q.band && { decision: { band: q.band } }),
  };
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { decision: { select: { band: true, finalScore: true, degraded: true } } },
    }),
  ]);
  const names = await payeeNames(rows.map((r) => r.payeeUpiId));
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    items: rows.map((t) => ({
      id: t.id,
      payeeUpiId: t.payeeUpiId,
      payeeName: names.get(t.payeeUpiId) ?? null,
      amount: Number(t.amount),
      note: t.note,
      status: t.status,
      createdAt: t.createdAt,
      band: t.decision?.band ?? null,
      score: t.decision?.finalScore ?? null,
    })),
  };
}

export async function payeeNames(upis: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(upis)];
  const [payees, users] = await Promise.all([
    prisma.payee.findMany({ where: { upiId: { in: unique } }, select: { upiId: true, displayName: true } }),
    prisma.user.findMany({ where: { upiId: { in: unique } }, select: { upiId: true, name: true } }),
  ]);
  return new Map([...payees.map((p) => [p.upiId, p.displayName] as const), ...users.map((u) => [u.upiId, u.name] as const)]);
}

/** What the payer sees before typing an amount: who this is, how long they've been around, and reports. */
export async function lookupPayee(userId: string, upi: string) {
  const [info, known] = await Promise.all([getPayeeInfo(upi), isKnownPayee(userId, upi)]);
  const ageDays = info.firstSeenAtMs === null ? null : Math.floor((Date.now() - info.firstSeenAtMs) / DAY);
  return {
    upiId: upi,
    displayName: info.displayName,
    onPlatform: info.firstSeenAtMs !== null,
    ageDays,
    reportCount: info.reportCount,
    confirmedFraud: info.confirmedFraud,
    paidBefore: known,
  };
}

export async function safetyOverview(userId: string) {
  const [warnings, reports] = await Promise.all([
    prisma.riskDecision.findMany({
      where: { band: { in: ["MEDIUM", "HIGH"] }, transaction: { userId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { transaction: { select: { id: true, payeeUpiId: true, amount: true, status: true, createdAt: true } } },
    }),
    prisma.payeeReport.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    warnings: warnings.map((d) => ({
      transactionId: d.transaction.id,
      payeeUpiId: d.transaction.payeeUpiId,
      amount: Number(d.transaction.amount),
      status: d.transaction.status,
      createdAt: d.transaction.createdAt,
      band: d.band,
      score: d.finalScore,
      topReason: (d.reasons as unknown as Reason[]).slice(0, 1).map((r) => renderReason(r).message)[0] ?? null,
    })),
    reports: reports.map((r) => ({ payeeUpiId: r.payeeUpiId, reason: r.reason, createdAt: r.createdAt })),
  };
}
