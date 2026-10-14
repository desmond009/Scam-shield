import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { Prisma } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/db";
import { hashDeviceId } from "../src/lib/device";
import { redis } from "../src/lib/redis";
import { hashPassword } from "../src/services/auth.service";

export const app = createApp();
export const PASSWORD = "Passw0rd!";
export const DEVICE = "test-phone";
const DAY = 86_400_000;

/** Controllable stand-in for the FastAPI service. */
export const mlStub = {
  score: 5,
  status: 200,
  delayMs: 0,
  hits: 0,
  server: null as Server | null,
  reset() {
    Object.assign(this, { score: 5, status: 200, delayMs: 0, hits: 0 });
  },
  start(): Promise<void> {
    this.server = createServer((req, res) => {
      this.hits++;
      setTimeout(() => {
        res.writeHead(this.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ probability: this.score / 100, score: this.score, modelVersion: "stub-1", topFeatures: [], latencyMs: 1 }));
      }, this.delayMs);
      req.resume();
    });
    return new Promise((resolve) => this.server!.listen(Number(process.env.ML_STUB_PORT), "127.0.0.1", resolve));
  },
  stop(): Promise<void> {
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  },
};

export async function resetState() {
  await redis.flushdb();
  mlStub.reset();
}

export async function createUser(opts: { role?: "USER" | "ANALYST" | "ADMIN"; balance?: number; historyTo?: string[]; ageDays?: number } = {}) {
  const id = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      name: `Test ${id}`,
      email: `t${id}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      role: opts.role ?? "USER",
      upiId: `t${id}@test`,
      balance: opts.balance ?? 50_000,
      deviceHash: hashDeviceId(DEVICE),
      createdAt: new Date(Date.now() - (opts.ageDays ?? 400) * DAY),
    },
  });
  // A month of ordinary afternoon payments of ~₹300-500 to the given payees.
  const rows: Prisma.TransactionCreateManyInput[] = (opts.historyTo ?? []).flatMap((payee, p) =>
    Array.from({ length: 10 }, (_, i) => {
      const at = new Date(Date.now() - (i * 2 + 1 + p) * DAY);
      at.setUTCHours(8, 30);
      return { userId: user.id, payeeUpiId: payee, amount: 300 + ((i * 37) % 200), status: "COMPLETED" as const, createdAt: at, completedAt: at, deviceHash: hashDeviceId(DEVICE) };
    }),
  );
  if (rows.length) await prisma.transaction.createMany({ data: rows });
  return user;
}

export async function createPayee(upiId: string, opts: { ageDays?: number; reportCount?: number; confirmedFraud?: boolean } = {}) {
  const data = {
    displayName: upiId,
    firstSeenAt: new Date(Date.now() - (opts.ageDays ?? 500) * DAY),
    reportCount: opts.reportCount ?? 0,
    confirmedFraudAt: opts.confirmedFraud ? new Date() : null,
  };
  return prisma.payee.upsert({ where: { upiId }, create: { upiId, ...data }, update: data });
}

export async function tokenFor(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.body.token as string;
}

export const authed = (token: string, device = DEVICE) => ({
  post: (path: string) => request(app).post(path).set("authorization", `Bearer ${token}`).set("x-device-id", device),
  get: (path: string) => request(app).get(path).set("authorization", `Bearer ${token}`).set("x-device-id", device),
  put: (path: string) => request(app).put(path).set("authorization", `Bearer ${token}`).set("x-device-id", device),
});
