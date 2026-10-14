import {
  DEFAULT_RULES,
  DEFAULT_THRESHOLDS,
  RULE_CODES,
  type RuleConfigEntry,
  type RuleUpdate,
  type Thresholds,
} from "@scamshield/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

const CACHE_MS = 5_000;
const THRESHOLDS_KEY = "thresholds";

let cache: { at: number; rules: RuleConfigEntry[]; thresholds: Thresholds } | null = null;

/** Rule configs and thresholds, editable at runtime. Cached per process for 5 s; writes invalidate locally. */
export async function getRiskConfig(): Promise<{ rules: RuleConfigEntry[]; thresholds: Thresholds }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [rows, setting] = await Promise.all([
    prisma.ruleConfig.findMany(),
    prisma.setting.findUnique({ where: { key: THRESHOLDS_KEY } }),
  ]);
  const byCode = new Map(rows.map((r) => [r.key, r]));
  const rules = DEFAULT_RULES.map((def) => {
    const row = byCode.get(def.code);
    return row
      ? { code: def.code, enabled: row.enabled, weight: row.weight, params: { ...def.params, ...(row.params as Record<string, number>) } }
      : def;
  });
  const thresholds = { ...DEFAULT_THRESHOLDS, ...((setting?.value as Partial<Thresholds> | undefined) ?? {}) };
  cache = { at: Date.now(), rules, thresholds };
  return cache;
}

export function invalidateRiskConfig() {
  cache = null;
}

export async function saveRules(updates: RuleUpdate[], actorId: string) {
  await prisma.$transaction(
    updates
      .filter((u) => (RULE_CODES as readonly string[]).includes(u.code))
      .map((u) =>
        prisma.ruleConfig.upsert({
          where: { key: u.code },
          create: { key: u.code, enabled: u.enabled, weight: u.weight, params: u.params, updatedBy: actorId },
          update: { enabled: u.enabled, weight: u.weight, params: u.params, updatedBy: actorId },
        }),
      ),
  );
  invalidateRiskConfig();
}

export async function saveThresholds(t: Thresholds, actorId: string) {
  const value = t as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: THRESHOLDS_KEY },
    create: { key: THRESHOLDS_KEY, value, updatedBy: actorId },
    update: { value, updatedBy: actorId },
  });
  invalidateRiskConfig();
}
