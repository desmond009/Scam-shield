import type { LoginInput, RegisterInput, Role } from "@scamshield/shared";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "../lib/db";
import { conflict, unauthorized } from "../lib/errors";
import { recordFailure } from "./redisState";

const BCRYPT_ROUNDS = 10;
/** New wallets start with synthetic demo money. */
export const STARTING_BALANCE = 25_000;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

export function publicUser(u: { id: string; name: string; email: string; role: Role; upiId: string; balance: unknown; createdAt: Date }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, upiId: u.upiId, balance: Number(u.balance), createdAt: u.createdAt };
}

async function uniqueUpiId(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 20) || "user";
  for (;;) {
    const upi = `${base}${randomInt(100, 9999)}@scamshield`;
    if (!(await prisma.user.findUnique({ where: { upiId: upi } }))) return upi;
  }
}

export async function register(input: RegisterInput, deviceHash: string) {
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict("An account with this email already exists");
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      upiId: await uniqueUpiId(input.name),
      balance: STARTING_BALANCE,
      deviceHash,
    },
  });
  return publicUser(user);
}

/** Wrong passwords count towards failed_attempts_15min (an account-takeover signal). */
export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = user ? await bcrypt.compare(input.password, user.passwordHash) : await bcrypt.compare(input.password, DUMMY_HASH);
  if (!user || !ok) {
    if (user) await recordFailure(user.id);
    throw unauthorized("Incorrect email or password");
  }
  return publicUser(user);
}

/** Constant-time-ish response for unknown emails (avoids user enumeration by timing). */
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return publicUser(user);
}
