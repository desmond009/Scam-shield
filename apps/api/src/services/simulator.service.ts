import { randomInt } from "node:crypto";
import { renderReason, type Reason, type Scenario } from "@scamshield/shared";
import { prisma } from "../lib/db";
import { hashDeviceId } from "../lib/device";
import { demoUser } from "../seed/demoData";
import { audit } from "./audit";
import type { DecisionView } from "./decisionView";
import { answerContext, cancelPayment, checkPayment, confirmPayment } from "./payments.service";
import { invalidatePayee, recordFailure, resetUserState } from "./redisState";

const DAY = 86_400_000;

export const SCENARIO_INFO: Record<Scenario, { title: string; description: string }> = {
  normal: {
    title: "Normal payment",
    description: "Arjun pays his usual grocery store a typical amount. Expect LOW: it goes through instantly.",
  },
  impersonation: {
    title: "Impersonation (fake KYC call)",
    description:
      "A caller posing as the bank pressures Meera, a senior citizen, to pay a 'KYC fee' to a 1-day-old account. She answers the questionnaire honestly, which raises the risk further.",
  },
  mule: {
    title: "Mule collection",
    description:
      "A 2-day-old 'job offer' account collects a ₹499 fee from many people. Early payments look ordinary; as distinct senders pile up, the mule pattern is detected.",
  },
  velocity: {
    title: "Velocity drain",
    description:
      "A remote-access app drains Karan's account with rapid, similar payments to one new recipient. Velocity and split-payment rules trip within a few payments.",
  },
  takeover: {
    title: "Account takeover",
    description:
      "After several failed sign-ins, someone on a new device tries to send almost all of Priya's balance to a new account.",
  },
};

export interface SimStep {
  step: number;
  actor: string;
  action: string;
  payeeUpiId: string;
  amount: number;
  band: string;
  score: number;
  ruleScore: number;
  mlScore: number | null;
  preContextScore: number | null;
  degraded: boolean;
  blocked: boolean;
  outcome: "completed" | "stopped" | "rescored";
  reasons: ReturnType<typeof renderReason>[];
  mlTopFeatures: unknown;
  latencyMs: number;
}

async function prepare(keys: string[]) {
  const users = await prisma.user.findMany({ where: { email: { in: keys.map((k) => demoUser(k).email) } } });
  for (const u of users) {
    const demo = keys.map(demoUser).find((d) => d.email === u.email)!;
    await resetUserState(u.id);
    // Balances are topped back up so every run starts from the same, explainable state.
    if (Number(u.balance) < demo.balance) await prisma.user.update({ where: { id: u.id }, data: { balance: demo.balance } });
  }
  return new Map(users.map((u) => [keys.find((k) => demoUser(k).email === u.email)!, u]));
}

async function step(n: number, actor: string, action: string, view: DecisionView, outcome: SimStep["outcome"]): Promise<SimStep> {
  const d = await prisma.riskDecision.findUniqueOrThrow({ where: { id: view.decisionId } });
  return {
    step: n,
    actor,
    action,
    payeeUpiId: view.payeeUpiId,
    amount: view.amount,
    band: view.band,
    score: view.score,
    ruleScore: view.ruleScore,
    mlScore: view.mlScore,
    preContextScore: view.preContextScore,
    degraded: view.degraded,
    blocked: view.blocked,
    outcome,
    reasons: (d.reasons as unknown as Reason[]).map((r) => renderReason(r)),
    mlTopFeatures: d.mlTopFeatures,
    latencyMs: d.latencyMs,
  };
}

/** A simulated victim continues through MEDIUM warnings but stops (cancels) at HIGH or BLOCKED. */
async function payAndProceed(userId: string, view: DecisionView): Promise<SimStep["outcome"]> {
  if (view.band === "HIGH" || view.blocked || !view.checkToken) {
    await cancelPayment(userId, view.transactionId, false);
    return "stopped";
  }
  await confirmPayment(userId, view.checkToken, undefined);
  return "completed";
}

const freshUpi = (prefix: string) => `${prefix}${randomInt(1000, 9999)}@ybl`;

async function scamPayee(prefix: string, displayName: string, ageDays: number) {
  const upiId = freshUpi(prefix);
  await prisma.payee.create({ data: { upiId, displayName, firstSeenAt: new Date(Date.now() - ageDays * DAY) } });
  await invalidatePayee(upiId);
  return upiId;
}

const meta = (key: string, device?: string) => ({ deviceHash: hashDeviceId(device ?? demoUser(key).deviceId), synthetic: true });

const RUNNERS: Record<Scenario, () => Promise<SimStep[]>> = {
  async normal() {
    const users = await prepare(["arjun"]);
    const arjun = users.get("arjun")!;
    const view = await checkPayment(arjun.id, { payeeUpiId: "kirana.sharma@okaxis", amount: 420 }, meta("arjun"));
    return [await step(1, arjun.name, "Pays the usual grocery store ₹420", view, await payAndProceed(arjun.id, view))];
  },

  async impersonation() {
    const users = await prepare(["meera"]);
    const meera = users.get("meera")!;
    const payee = await scamPayee("kyc.helpdesk", "Bank KYC Helpdesk", 1);
    const view = await checkPayment(meera.id, { payeeUpiId: payee, amount: 1_999 }, meta("meera"));
    const steps = [await step(1, meera.name, "Pays a ₹1,999 'KYC fee' to a new account", view, "rescored")];
    if (view.requiresContext) {
      const rescored = await answerContext(meera.id, view.transactionId, { pressure: true, otpOrApp: false, knowRecipient: false });
      steps.push(await step(2, meera.name, "Answers: yes, someone called urging me; no, I don't know the recipient", rescored, await payAndProceed(meera.id, rescored)));
    } else {
      steps[0].outcome = await payAndProceed(meera.id, view);
    }
    return steps;
  },

  async mule() {
    const victims = Array.from({ length: 8 }, (_, i) => `victim${i + 1}`);
    const users = await prepare(victims);
    const payee = await scamPayee("easy.earn.jobs", "Easy Earn Jobs", 2);
    const steps: SimStep[] = [];
    for (const [i, key] of victims.entries()) {
      const u = users.get(key)!;
      const view = await checkPayment(u.id, { payeeUpiId: payee, amount: 499 }, meta(key));
      steps.push(await step(i + 1, u.name, `Pays the ₹499 'registration fee'`, view, await payAndProceed(u.id, view)));
    }
    return steps;
  },

  async velocity() {
    const users = await prepare(["karan"]);
    const karan = users.get("karan")!;
    const payee = freshUpi("quick.transfer");
    const steps: SimStep[] = [];
    for (let i = 0; i < 5; i++) {
      const amount = 1_500 + randomInt(0, 100);
      const view = await checkPayment(karan.id, { payeeUpiId: payee, amount }, meta("karan"));
      const outcome = await payAndProceed(karan.id, view);
      steps.push(await step(i + 1, karan.name, `Rapid payment ${i + 1} of ₹${amount.toLocaleString("en-IN")}`, view, outcome));
      if (outcome === "stopped") break;
    }
    return steps;
  },

  async takeover() {
    const users = await prepare(["priya"]);
    const priya = users.get("priya")!;
    for (let i = 0; i < 4; i++) await recordFailure(priya.id);
    const amount = Math.round(Math.max(Number(priya.balance), demoUser("priya").balance) * 0.9);
    const view = await checkPayment(
      priya.id,
      { payeeUpiId: freshUpi("cash.out"), amount },
      meta("priya", `attacker-device-${randomInt(1e6)}`),
    );
    return [
      await step(1, "Unknown device", `4 failed sign-ins, then ₹${amount.toLocaleString("en-IN")} to a new account from a new device`, view, await payAndProceed(priya.id, view)),
    ];
  },
};

export async function runScenario(scenario: Scenario, actorId: string) {
  const steps = await RUNNERS[scenario]();
  await audit(actorId, "simulator.run", `Scenario:${scenario}`, { steps: steps.length, finalBand: steps.at(-1)?.band });
  return { scenario, ...SCENARIO_INFO[scenario], steps, finalBand: steps.at(-1)?.band ?? null };
}
