import { computeFeatures, type ContextAnswers, type FeatureInput, type Features } from "@scamshield/shared";
import { prisma } from "../lib/db";
import { notFound } from "../lib/errors";
import {
  failedAttempts,
  getPayeeInfo,
  getProfile,
  isKnownDevice,
  isKnownPayee,
  payeeDistinctSenders,
  velocityCounts,
  type PayeeInfo,
} from "./redisState";

export interface FeatureRequest {
  userId: string;
  payeeUpiId: string;
  amount: number;
  deviceHash: string;
  now: number;
  context?: ContextAnswers | null;
}

export interface BuiltFeatures {
  input: FeatureInput;
  features: Features;
  payee: PayeeInfo;
  userUpiId: string;
}

/** Gathers the user's state from Redis (counters, baseline cache) and Postgres (balance), then computes features. */
export async function buildFeatures(req: FeatureRequest): Promise<BuiltFeatures> {
  const { userId, payeeUpiId: upi, amount, now } = req;
  const [user, history, knownPayee, knownDevice, payee, senders, velocity, failures] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { balance: true, createdAt: true, upiId: true } }),
    getProfile(userId),
    isKnownPayee(userId, upi),
    isKnownDevice(userId, req.deviceHash),
    getPayeeInfo(upi),
    payeeDistinctSenders(upi, userId, now),
    velocityCounts(userId, upi, amount, now),
    failedAttempts(userId, now),
  ]);
  if (!user) throw notFound("User not found");
  const input: FeatureInput = {
    amount,
    balance: Number(user.balance),
    timestampMs: now,
    accountCreatedAtMs: user.createdAt.getTime(),
    history,
    isNewPayee: !knownPayee,
    payeeFirstSeenAtMs: payee.firstSeenAtMs,
    payeeDistinctSenders24h: senders,
    payeeReportCount: payee.reportCount,
    userTxnCount10min: velocity.count10min,
    userTxnCount1h: velocity.count1h,
    sameAmountRepeat1h: velocity.sameAmount,
    isNewDevice: !knownDevice,
    failedAttempts15min: failures,
    context: req.context ?? null,
  };
  return { input, features: computeFeatures(input), payee, userUpiId: user.upiId };
}
