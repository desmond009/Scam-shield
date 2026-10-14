import { DEFAULT_RULES, DEFAULT_THRESHOLDS } from "@scamshield/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { hashDeviceId } from "../lib/device";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import { hashPassword } from "../services/auth.service";
import { DEMO_PASSWORD, DEMO_USERS, MERCHANTS, PERSONA_HABITS, SCAM_PAYEES, type DemoUser } from "./demoData";

const DAY = 86_400_000;
const HISTORY_DAYS = 60;

/** Small deterministic PRNG so every fresh install gets the same demo history. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function history(u: DemoUser, seed: number, now: number): Prisma.TransactionCreateManyInput[] {
  const rand = mulberry32(seed);
  const habits = PERSONA_HABITS[u.persona];
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const deviceHash = hashDeviceId(u.deviceId);
  const rows: Prisma.TransactionCreateManyInput[] = [];
  const dayStartIst = (d: number) => Math.floor((now + 330 * 60_000) / DAY) * DAY - 330 * 60_000 - d * DAY;
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const count = Math.floor(habits.perDay + rand() * 2 - 0.5);
    for (let i = 0; i < count; i++) {
      // Favour the first few payees (the user's regular shops), like real payment habits.
      const payee = u.payees[Math.floor(u.payees.length * rand() ** 2)];
      const amount = Math.min(8_000, Math.max(10, Math.round(habits.median * Math.exp(habits.sigma * normal()))));
      const hour = habits.hours[0] + rand() * (habits.hours[1] - habits.hours[0]);
      const at = new Date(dayStartIst(d) + hour * 3_600_000);
      rows.push({ userId: "", payeeUpiId: payee, amount, status: "COMPLETED", createdAt: at, completedAt: at, deviceHash, isSynthetic: true, label: "SAFE" });
    }
    if (u.payees.includes("kapoor.rent@oksbi") && d % 30 === 5) {
      const at = new Date(dayStartIst(d) + 10 * 3_600_000);
      rows.push({ userId: "", payeeUpiId: "kapoor.rent@oksbi", amount: 15_000, status: "COMPLETED", createdAt: at, completedAt: at, deviceHash, isSynthetic: true, label: "SAFE", note: "Rent" });
    }
  }
  return rows;
}

async function seedConfig() {
  for (const r of DEFAULT_RULES) {
    await prisma.ruleConfig.upsert({
      where: { key: r.code },
      create: { key: r.code, enabled: r.enabled, weight: r.weight, params: r.params },
      update: {},
    });
  }
  await prisma.setting.upsert({
    where: { key: "thresholds" },
    create: { key: "thresholds", value: DEFAULT_THRESHOLDS as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

async function seedPayees(now: number) {
  for (const p of [...MERCHANTS, ...SCAM_PAYEES]) {
    await prisma.payee.upsert({
      where: { upiId: p.upiId },
      create: {
        upiId: p.upiId,
        displayName: p.displayName,
        firstSeenAt: new Date(now - p.ageDays * DAY),
        reportCount: p.reportCount ?? 0,
        reputationScore: Math.min(100, (p.reportCount ?? 0) * 15 + (p.confirmedFraud ? 60 : 0)),
        confirmedFraudAt: p.confirmedFraud ? new Date(now - DAY) : null,
      },
      update: {},
    });
  }
}

async function seedUsers(now: number) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const [i, u] of DEMO_USERS.entries()) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        upiId: u.upiId,
        balance: u.balance,
        deviceHash: hashDeviceId(u.deviceId),
        createdAt: new Date(now - u.accountAgeDays * DAY),
      },
    });
    const rows = history(u, 1000 + i, now).map((r) => ({ ...r, userId: user.id }));
    await prisma.transaction.createMany({ data: rows });
  }
}

export async function seed() {
  await seedConfig();
  if (await prisma.user.findUnique({ where: { email: DEMO_USERS[0].email } })) {
    logger.info("seed: demo data already present");
    return;
  }
  const now = Date.now();
  await seedPayees(now);
  await seedUsers(now);
  const txns = await prisma.transaction.count();
  logger.info({ users: DEMO_USERS.length, transactions: txns }, "seed: demo data created");
}

if (require.main === module) {
  seed()
    .catch((err) => {
      logger.error({ err }, "seed failed");
      process.exitCode = 1;
    })
    .finally(() => Promise.all([prisma.$disconnect(), redis.quit()]));
}
