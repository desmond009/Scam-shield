import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

/** Every analyst/admin action that changes state is recorded. */
export async function audit(actorId: string, action: string, entity: string, meta: Record<string, unknown> = {}) {
  await prisma.auditLog.create({ data: { actorId, action, entity, meta: meta as Prisma.InputJsonValue } });
}
